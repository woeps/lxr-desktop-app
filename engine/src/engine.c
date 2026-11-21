/*
 * engine.c: the Engine API. Queues changes from the control core and applies
 * them on the audio core at the start of each Block.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "lxr/engine.h"
#include "Parameters.h"
#include "Soundengine/Soundengine.h"
#include "Soundengine/param_apply.h"
#include "Soundengine/MIDI/MidiVoiceControl.h"
#include "Soundengine/DSPAudio/Oscillator.h"

/* ---- command queue (single producer: control core, single consumer: audio core) ---- */

enum { CMD_PARAM = 1, CMD_TRIGGER = 2 };

typedef struct {
	uint16_t id;      /* parameter id */
	uint8_t type;
	uint8_t a;        /* parameter value, or voice */
	uint8_t b;        /* note */
	uint8_t c;        /* velocity */
} Command;

#define QUEUE_SIZE 256u               /* power of two */
#define QUEUE_MASK (QUEUE_SIZE - 1u)

static Command queue[QUEUE_SIZE];
static volatile uint32_t queueHead;   /* written by the producer */
static volatile uint32_t queueTail;   /* written by the consumer */

static int queuePush(const Command *cmd)
{
	const uint32_t head = queueHead;
	const uint32_t tail = __atomic_load_n(&queueTail, __ATOMIC_ACQUIRE);
	if(head - tail >= QUEUE_SIZE)
		return -1;
	queue[head & QUEUE_MASK] = *cmd;
	__atomic_store_n(&queueHead, head + 1u, __ATOMIC_RELEASE);
	return 0;
}

static int queuePop(Command *cmd)
{
	const uint32_t tail = queueTail;
	const uint32_t head = __atomic_load_n(&queueHead, __ATOMIC_ACQUIRE);
	if(tail == head)
		return 0;
	*cmd = queue[tail & QUEUE_MASK];
	__atomic_store_n(&queueTail, tail + 1u, __ATOMIC_RELEASE);
	return 1;
}

/* ---- state shared with the control core ---- */

static lxr_param_cb paramCallback;
static void *paramCallbackUser;
static lxr_stats_t stats = { .temp_c_x10 = INT16_MIN, .midi_line = -1 };
static uint64_t blockTimeSum;      /* audio core */
static uint32_t blockTimeCount;    /* audio core */
static volatile uint8_t statsResetRequest;

/* one-second windows for the rolling statistics (R3.5) and the output level (R6.2) */
#define STATS_WINDOW_BLOCKS (44100u / LXR_BLOCK_FRAMES)           /* 689 Blocks = 1.0 s */
#define BLOCK_PERIOD_US ((uint32_t)(LXR_BLOCK_FRAMES * 1000000u / 44100u))   /* 1451 us */
static uint32_t windowWorstUs, windowTimeBlocks;   /* lxr_stats_report_block (audio core) */
static uint16_t windowPeak;
static uint32_t windowPeakBlocks;                  /* lxr_engine_render (audio core) */

/* whole-sound load (lxr_sound_set): request from the control core, cursor on the audio core */
_Static_assert(LXR_SOUND_PARAM_COUNT == END_OF_SOUND_PARAMETERS, "LXR_SOUND_PARAM_COUNT must match Parameters.h");
#define SOUND_RELOAD_PER_BLOCK 32u
static uint8_t soundReloadRequest;
static uint16_t soundReloadCursor = LXR_SOUND_PARAM_COUNT;

/* ---- audio core ---- */

/** Applies one stored parameter to the voices and FX. */
static void applyParameter(uint16_t id, uint8_t value)
{
	/* Modulation targets are stored as an index into the mod target list; the
	 * modulation node needs the parameter id (the old front panel translated this). */
	if(id >= PAR_VEL_DEST_1 && id <= PAR_VEL_DEST_6)
	{
		modNode_setDestination(&velocityModulators[id - PAR_VEL_DEST_1], lxr_mod_target_param(value));
		return;
	}
	if(id >= PAR_TARGET_LFO1 && id <= PAR_TARGET_LFO6)
	{
		static ModulationNode *const lfoTargets[6] = {
			&voiceArray[0].lfo.modTarget, &voiceArray[1].lfo.modTarget, &voiceArray[2].lfo.modTarget,
			&snareVoice.lfo.modTarget, &cymbalVoice.lfo.modTarget, &hatVoice.lfo.modTarget,
		};
		modNode_setDestination(lfoTargets[id - PAR_TARGET_LFO1], lxr_mod_target_param(value));
		return;
	}

	MidiMsg msg;
	msg.data2 = value;
	if(id < 128)
	{
		/* CC numbers are the parameter id + 1, wrapping at 128 (the old "stupid offset") */
		msg.status = MIDI_CC;
		msg.data1 = (uint8_t)((id + 1) & 0x7f);
	}
	else
	{
		msg.status = CC_2;
		msg.data1 = (uint8_t)((id - 128) & 0x7f);
	}
	engine_applyCc(msg, 1, 0, 0.f);
}

void lxr_engine_init(uint32_t sample_rate)
{
	(void)sample_rate; /* the DSP is tuned for 44.1 kHz (SYNTH_FS) */

	lxr_enable_flush_to_zero();
	soundengine_init();

	/* factory defaults from the parameter table */
	const uint16_t count = lxr_param_count();
	for(uint16_t i = 0; i < count; i++)
	{
		const lxr_param_info_t *p = lxr_param_info(i);
		activeParameters[p->id] = p->def;
		if(p->id < END_OF_SOUND_PARAMETERS)
			applyParameter(p->id, p->def);
	}
}

void lxr_engine_render(int16_t *stereo, uint32_t frames)
{
	if(frames != LXR_BLOCK_FRAMES)
		return;

	/* FPSCR is per core: set flush-to-zero on the core that renders */
	static uint8_t ftzDone;
	if(!ftzDone)
	{
		lxr_enable_flush_to_zero();
		ftzDone = 1;
	}

	Command cmd;
	while(queuePop(&cmd))
	{
		if(cmd.type == CMD_PARAM)
		{
			applyParameter(cmd.id, cmd.a);
		}
		else if(cmd.type == CMD_TRIGGER)
		{
			if(!engine_isVoiceMuted(cmd.a))
				voiceControl_noteOn(cmd.a, cmd.b, cmd.c);
		}
	}

	stats.blocks++;

	/* a whole-sound load from lxr_sound_set, spread over several Blocks */
	if(__atomic_exchange_n(&soundReloadRequest, 0, __ATOMIC_ACQUIRE))
		soundReloadCursor = 0;
	if(soundReloadCursor < LXR_SOUND_PARAM_COUNT)
	{
		const uint16_t end = (uint16_t)(soundReloadCursor + SOUND_RELOAD_PER_BLOCK);
		for(; soundReloadCursor < end && soundReloadCursor < LXR_SOUND_PARAM_COUNT; soundReloadCursor++)
		{
			if(lxr_param_find_id(soundReloadCursor))
				applyParameter(soundReloadCursor, activeParameters[soundReloadCursor]);
		}
	}

	soundengine_renderBlock(stereo);

	/* output level: peak over one-second windows */
	for(uint32_t i = 0; i < LXR_BLOCK_FRAMES * 2u; i++)
	{
		const int32_t s = stereo[i];
		const uint16_t a = (uint16_t)(s < 0 ? (s == -32768 ? 32767 : -s) : s);
		if(a > windowPeak)
			windowPeak = a;
	}
	if(++windowPeakBlocks >= STATS_WINDOW_BLOCKS)
	{
		stats.out_peak = windowPeak;
		windowPeak = 0;
		windowPeakBlocks = 0;
	}
}

void lxr_stats_report_block(uint32_t block_us)
{
	if(statsResetRequest)
	{
		stats.worst_block_us = 0;
		stats.underruns = 0;
		blockTimeSum = 0;
		blockTimeCount = 0;
		statsResetRequest = 0;
	}
	if(block_us > stats.worst_block_us)
		stats.worst_block_us = block_us;
	blockTimeSum += block_us;
	blockTimeCount++;
	stats.avg_block_us = (uint32_t)(blockTimeSum / blockTimeCount);
	{
		const uint32_t pct = (stats.avg_block_us * 100u + BLOCK_PERIOD_US / 2u) / BLOCK_PERIOD_US;
		stats.cpu_percent = (uint8_t)(pct > 100u ? 100u : pct);
	}

	if(block_us > windowWorstUs)
		windowWorstUs = block_us;
	if(++windowTimeBlocks >= STATS_WINDOW_BLOCKS)
	{
		stats.recent_worst_block_us = windowWorstUs;
		windowWorstUs = 0;
		windowTimeBlocks = 0;
	}
}

void lxr_stats_report_underrun(void)
{
	stats.underruns++;
}

void lxr_stats_reset(void)
{
	statsResetRequest = 1;
}

void lxr_stats_report_board(uint32_t sys_clock_khz, int16_t temp_c_x10)
{
	stats.sys_clock_khz = sys_clock_khz;
	stats.temp_c_x10 = temp_c_x10;
}

/* ---- control core ---- */

void lxr_trigger_note(uint8_t voice, uint8_t note, uint8_t velocity)
{
	if(voice >= LXR_NUM_VOICE_SLOTS || velocity == 0)
		return;

	Command cmd = { 0, CMD_TRIGGER, voice, (uint8_t)(note & 0x7f), (uint8_t)(velocity & 0x7f) };
	if(queuePush(&cmd) != 0)
		stats.queue_drops++;
}

void lxr_trigger(lxr_voice_t voice, uint8_t velocity)
{
	lxr_trigger_note((uint8_t)voice, OSC_DEFAULT_NOTE, velocity);
}

/* ---- audio core: MIDI input ---- */

/* Parameter changes made on the audio core, reported to the control core.
 * Single producer (audio core), single consumer (control core). */
typedef struct { uint16_t id; uint8_t value; } ParamEvent;
#define EVENT_SIZE 64u                /* power of two */
#define EVENT_MASK (EVENT_SIZE - 1u)
static ParamEvent events[EVENT_SIZE];
static volatile uint32_t eventHead;   /* audio core */
static volatile uint32_t eventTail;   /* control core */

void lxr_midi_trigger_note(uint8_t voice, uint8_t note, uint8_t velocity)
{
	if(voice >= LXR_NUM_VOICE_SLOTS || velocity == 0 || engine_isVoiceMuted(voice))
		return;
	stats.midi_notes++;
	voiceControl_noteOn(voice, (uint8_t)(note & 0x7f), (uint8_t)(velocity & 0x7f));
}

int lxr_midi_param_set(uint16_t id, uint8_t value)
{
	const lxr_param_info_t *info = lxr_param_find_id(id);
	if(!info || value < info->min || value > info->max)
		return -1;
	activeParameters[id] = value;
	if(id < END_OF_SOUND_PARAMETERS)
		applyParameter(id, value);

	const uint32_t head = eventHead;
	if(head - __atomic_load_n(&eventTail, __ATOMIC_ACQUIRE) >= EVENT_SIZE)
	{
		stats.event_drops++;
		return 0;   /* the change is applied, only the UI notification is lost */
	}
	events[head & EVENT_MASK] = (ParamEvent){ id, value };
	__atomic_store_n(&eventHead, head + 1u, __ATOMIC_RELEASE);
	return 0;
}

void lxr_dispatch_param_events(void)
{
	uint32_t tail = eventTail;
	const uint32_t head = __atomic_load_n(&eventHead, __ATOMIC_ACQUIRE);
	while(tail != head)
	{
		const ParamEvent e = events[tail & EVENT_MASK];
		tail++;
		__atomic_store_n(&eventTail, tail, __ATOMIC_RELEASE);
		if(paramCallback)
			paramCallback(e.id, e.value, paramCallbackUser);
	}
}

int lxr_param_set(uint16_t id, uint8_t value)
{
	const lxr_param_info_t *info = lxr_param_find_id(id);
	if(!info || value < info->min || value > info->max)
		return -1;

	if(id < END_OF_SOUND_PARAMETERS)
	{
		Command cmd = { id, CMD_PARAM, value, 0, 0 };
		if(queuePush(&cmd) != 0)
		{
			stats.queue_drops++;
			return -1;
		}
	}
	activeParameters[id] = value;

	if(paramCallback)
		paramCallback(id, value, paramCallbackUser);
	return 0;
}

int lxr_param_get(uint16_t id, uint8_t *value)
{
	if(!lxr_param_find_id(id))
		return -1;
	*value = activeParameters[id];
	return 0;
}

void lxr_set_param_callback(lxr_param_cb cb, void *user)
{
	paramCallbackUser = user;
	paramCallback = cb;
}

void lxr_sound_get(uint8_t values[LXR_SOUND_PARAM_COUNT])
{
	memcpy(values, activeParameters, LXR_SOUND_PARAM_COUNT);
}

void lxr_sound_set(const uint8_t values[LXR_SOUND_PARAM_COUNT])
{
	for(uint16_t id = 0; id < LXR_SOUND_PARAM_COUNT; id++)
	{
		const lxr_param_info_t *info = lxr_param_find_id(id);
		if(!info)
			continue;
		uint8_t v = values[id];
		if(v < info->min) v = info->min;
		if(v > info->max) v = info->max;
		if(activeParameters[id] == v)
			continue;
		activeParameters[id] = v;
		if(paramCallback)
			paramCallback(id, v, paramCallbackUser);
	}
	/* release: the audio core sees all values above before it starts applying them */
	__atomic_store_n(&soundReloadRequest, 1, __ATOMIC_RELEASE);
}

void lxr_get_stats(lxr_stats_t *out)
{
	*out = stats;
}

void lxr_stats_count_midi_error(void)
{
	stats.midi_errors++;
}

uint32_t lxr_midi_note_count(void)
{
	return stats.midi_notes;
}

static uint8_t midiLog[16];

void lxr_stats_count_midi_byte(uint8_t byte)
{
	midiLog[stats.midi_bytes & 15u] = byte;
	stats.midi_bytes++;
}

int lxr_get_midi_log(uint8_t out[16])
{
	const uint32_t n = stats.midi_bytes < 16u ? stats.midi_bytes : 16u;
	for(uint32_t i = 0; i < n; i++)
		out[i] = midiLog[(stats.midi_bytes - n + i) & 15u];
	return (int)n;
}

void lxr_stats_report_midi_line(int level, uint32_t falling_edges)
{
	stats.midi_line = (int8_t)(level ? 1 : 0);
	stats.midi_line_edges = falling_edges;
}

void lxr_stats_report_midi_debug(const uint32_t regs[3])
{
	for(int i = 0; i < 3; i++)
		stats.midi_debug[i] = regs[i];
}

void lxr_stats_report_flash_write(uint32_t us)
{
	stats.flash_write_us = us;
	if(us > stats.flash_write_max_us)
		stats.flash_write_max_us = us;
}

static uint64_t latencyBufferSum, latencyOutputSum;
static volatile uint8_t latencyResetRequest;

void lxr_stats_reset_latency(void)
{
	latencyResetRequest = 1;
}

void lxr_stats_report_note_latency(uint32_t to_buffer_us, uint32_t to_output_us)
{
	if(latencyResetRequest || stats.latency_count == 0)
	{
		stats.latency_count = 0;
		latencyBufferSum = latencyOutputSum = 0;
		stats.latency_buffer_min_us = stats.latency_output_min_us = UINT32_MAX;
		stats.latency_buffer_max_us = stats.latency_output_max_us = 0;
		latencyResetRequest = 0;
	}
	if(to_buffer_us < stats.latency_buffer_min_us) stats.latency_buffer_min_us = to_buffer_us;
	if(to_buffer_us > stats.latency_buffer_max_us) stats.latency_buffer_max_us = to_buffer_us;
	if(to_output_us < stats.latency_output_min_us) stats.latency_output_min_us = to_output_us;
	if(to_output_us > stats.latency_output_max_us) stats.latency_output_max_us = to_output_us;
	latencyBufferSum += to_buffer_us;
	latencyOutputSum += to_output_us;
	stats.latency_count++;
	stats.latency_buffer_avg_us = (uint32_t)(latencyBufferSum / stats.latency_count);
	stats.latency_output_avg_us = (uint32_t)(latencyOutputSum / stats.latency_count);
}

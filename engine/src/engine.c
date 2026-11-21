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

/* ---- audio core ---- */

/** Applies one stored parameter to the voices and FX. */
static void applyParameter(uint16_t id, uint8_t value)
{
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
	soundengine_renderBlock(stereo);
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

void lxr_get_stats(lxr_stats_t *out)
{
	*out = stats;
}

void lxr_stats_count_midi_error(void)
{
	stats.midi_errors++;
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

void lxr_stats_report_midi_line(int level)
{
	stats.midi_line = (int8_t)(level ? 1 : 0);
}

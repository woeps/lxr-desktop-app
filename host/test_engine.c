/*
 * test_engine.c: Engine API and UI fan-out tests (task 5.5).
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lxr/engine.h"
#include "Parameters.h"
#include "ui_iface.h"
#include "Soundengine/DSPAudio/modulationNode.h"
#include "Soundengine/DSPAudio/DrumVoice.h"

static int failures = 0;

#define CHECK(cond, ...) \
	do { if(!(cond)) { failures++; printf("FAIL: "); printf(__VA_ARGS__); printf("\n"); } } while(0)

static int16_t block[LXR_BLOCK_FRAMES * 2];

/** Renders n Blocks and returns the largest absolute sample. */
static int peakOfBlocks(int n)
{
	int peak = 0;
	for(int b = 0; b < n; b++)
	{
		lxr_engine_render(block, LXR_BLOCK_FRAMES);
		for(int i = 0; i < LXR_BLOCK_FRAMES * 2; i++)
		{
			const int a = abs(block[i]);
			if(a > peak) peak = a;
		}
	}
	return peak;
}

/** Renders n Blocks and returns the summed squared samples. */
static double energyOfBlocks(int n)
{
	double e = 0;
	for(int b = 0; b < n; b++)
	{
		lxr_engine_render(block, LXR_BLOCK_FRAMES);
		for(int i = 0; i < LXR_BLOCK_FRAMES * 2; i++)
			e += (double)block[i] * (double)block[i];
	}
	return e;
}

static uint16_t cbCount;
static uint16_t cbId;
static uint8_t cbValue;
static void onChange(uint16_t id, uint8_t value, void *user)
{
	(void)user;
	cbCount++;
	cbId = id;
	cbValue = value;
}

static int uiAChanges, uiBChanges, uiAInit, uiBPoll;
static void uiAInitFn(void) { uiAInit++; }
static void uiAChanged(uint16_t id, uint8_t value) { (void)id; (void)value; uiAChanges++; }
static void uiBPollFn(void) { uiBPoll++; }
static void uiBChanged(uint16_t id, uint8_t value) { (void)id; (void)value; uiBChanges++; }

int main(void)
{
	lxr_engine_init(44100);
	uint8_t v = 0;

	/* factory MIDI defaults: one channel per voice slot (1..7), any note, global off */
	for(int i = 0; i < 6; i++)
	{
		CHECK(lxr_param_get(PAR_MIDI_CHAN_1 + i, &v) == 0 && v == i + 1, "midi_chan_%d default %u", i + 1, v);
		CHECK(lxr_param_get(PAR_MIDI_NOTE1 + i, &v) == 0 && v == 0, "midi_note%d default %u", i + 1, v);
	}
	CHECK(lxr_param_get(PAR_MIDI_CHAN_7, &v) == 0 && v == 7, "midi_chan_7 default %u", v);
	CHECK(lxr_param_get(PAR_MIDI_CHAN_GLOBAL, &v) == 0 && v == 0, "global channel default %u", v);

	/* set / get round trip */
	const lxr_param_info_t *vol1 = lxr_param_find("vol1");
	CHECK(vol1 != NULL, "vol1 missing");
	CHECK(lxr_param_get(vol1->id, &v) == 0 && v == vol1->def, "default of vol1 is %u, table says %u", v, vol1->def);
	CHECK(lxr_param_set(vol1->id, 77) == 0, "set vol1 failed");
	CHECK(lxr_param_get(vol1->id, &v) == 0 && v == 77, "vol1 reads %u after set 77", v);

	/* rejected values leave the parameter unchanged */
	const lxr_param_info_t *mix = lxr_param_find("mix_mod_1");
	CHECK(mix != NULL && mix->max == 1, "mix_mod_1 range");
	CHECK(lxr_param_set(mix->id, 2) == -1, "out-of-range value accepted");
	CHECK(lxr_param_get(mix->id, &v) == 0 && v == mix->def, "rejected set changed the value");
	CHECK(lxr_param_set(PAR_BPM, 100) == -1, "sequencer slot accepted");
	CHECK(lxr_param_set(9999, 1) == -1, "unknown id accepted");
	CHECK(lxr_param_get(9999, &v) == -1, "unknown id readable");

	/* callback fires once per accepted change and not for rejected ones */
	lxr_set_param_callback(onChange, NULL);
	cbCount = 0;
	lxr_param_set(vol1->id, 90);
	CHECK(cbCount == 1 && cbId == vol1->id && cbValue == 90, "callback count %u id %u value %u", cbCount, cbId, cbValue);
	lxr_param_set(mix->id, 5);
	CHECK(cbCount == 1, "callback fired for a rejected value");
	lxr_set_param_callback(NULL, NULL);
	lxr_param_set(vol1->id, 91);
	CHECK(cbCount == 1, "callback fired after removal");
	peakOfBlocks(4); /* drain the queue */

	/* silence before any trigger */
	lxr_engine_init(44100);
	CHECK(peakOfBlocks(20) == 0, "output is not silent before the first trigger");

	/* every voice slot makes sound */
	for(int voice = 0; voice < LXR_NUM_VOICE_SLOTS; voice++)
	{
		lxr_engine_init(44100);
		lxr_trigger_note((uint8_t)voice, 60, 127);
		const int peak = peakOfBlocks(60);
		CHECK(peak > 200, "voice slot %d is silent (peak %d)", voice, peak);
	}

	/* a trigger with velocity 0 and an invalid slot do nothing */
	lxr_engine_init(44100);
	lxr_trigger_note(0, 60, 0);
	lxr_trigger_note(LXR_NUM_VOICE_SLOTS, 60, 100);
	CHECK(peakOfBlocks(20) == 0, "invalid trigger produced sound");

	/* a full queue drops and reports instead of blocking */
	lxr_engine_init(44100);
	int rejected = 0;
	for(int i = 0; i < 400; i++)
		if(lxr_param_set(vol1->id, (uint8_t)(i & 0x7f)) != 0) rejected++;
	lxr_stats_t st;
	lxr_get_stats(&st);
	CHECK(rejected > 0 && st.queue_drops == (uint32_t)rejected, "queue overflow: %d rejected, %u counted", rejected, st.queue_drops);
	peakOfBlocks(2);
	CHECK(lxr_param_set(vol1->id, 50) == 0, "queue still full after draining");

	/* stats: worst and average since the last reset, reset applied on the next Block */
	lxr_stats_reset();
	lxr_stats_report_block(300);
	lxr_stats_report_block(900);
	lxr_stats_report_underrun();
	lxr_stats_count_midi_error();
	lxr_get_stats(&st);
	CHECK(st.worst_block_us == 900 && st.avg_block_us == 600 && st.underruns == 1 && st.midi_errors == 1,
	      "stats worst %u avg %u underruns %u midi %u", st.worst_block_us, st.avg_block_us, st.underruns, st.midi_errors);
	CHECK(st.temp_c_x10 == INT16_MIN && st.sys_clock_khz == 0, "board facts not unknown before the board reports");
	lxr_stats_reset();
	lxr_stats_report_block(100);
	lxr_get_stats(&st);
	CHECK(st.worst_block_us == 100 && st.avg_block_us == 100 && st.underruns == 0, "reset: worst %u avg %u underruns %u",
	      st.worst_block_us, st.avg_block_us, st.underruns);
	lxr_stats_report_board(200000, 412);
	lxr_get_stats(&st);
	CHECK(st.sys_clock_khz == 200000 && st.temp_c_x10 == 412, "board facts");

	/* modulation targets: the stored index is translated to the target parameter */
	{
		CHECK(lxr_mod_target_count() == 229 && lxr_mod_target_param(0) == 0, "mod target list");
		uint16_t idx = 0;
		for(uint16_t i = 0; i < lxr_mod_target_count(); i++)
			if(lxr_mod_target_param(i) == PAR_FILTER_FREQ_1) { idx = i; break; }
		CHECK(idx != 0, "filter_freq_1 is not a mod target");

		lxr_engine_init(44100);
		lxr_param_set(PAR_VEL_DEST_1, (uint8_t)idx);
		lxr_param_set(PAR_TARGET_LFO2, (uint8_t)idx);
		peakOfBlocks(2);
		CHECK(velocityModulators[0].destination == PAR_FILTER_FREQ_1, "vel_dest_1 -> destination %u", velocityModulators[0].destination);
		CHECK(voiceArray[1].lfo.modTarget.destination == PAR_FILTER_FREQ_1, "target_lfo2 -> destination %u", voiceArray[1].lfo.modTarget.destination);

		/* audible: with velocity on the voice volume, a hard hit is louder than a soft one */
		uint16_t volIdx = 0;
		for(uint16_t i = 0; i < lxr_mod_target_count(); i++)
			if(lxr_mod_target_param(i) == PAR_VOL1) { volIdx = i; break; }
		CHECK(volIdx != 0, "vol1 is not a mod target");
		lxr_param_set(PAR_VEL_DEST_1, (uint8_t)volIdx);
		lxr_param_set(PAR_VOL1, 64);
		lxr_param_set(PAR_VELO_MOD_AMT_1, 127);
		peakOfBlocks(2);
		lxr_trigger_note(0, 60, 10);
		const double soft = energyOfBlocks(30);
		peakOfBlocks(300);
		lxr_trigger_note(0, 60, 127);
		const double hard = energyOfBlocks(30);
		CHECK(hard > soft * 4, "velocity modulation has no effect (energy soft %.0f, hard %.0f)", soft, hard);
	}

	/* MIDI path (audio core): applied at once, reported to the control core via dispatch */
	{
		lxr_engine_init(44100);
		lxr_set_param_callback(onChange, NULL);
		cbCount = 0;
		CHECK(lxr_midi_param_set(PAR_VOL1, 55) == 0, "midi param set");
		CHECK(voiceArray[0].vol > 0.42f && voiceArray[0].vol < 0.45f, "midi param not applied immediately (vol %f)", (double)voiceArray[0].vol);
		uint8_t mv = 0;
		lxr_param_get(PAR_VOL1, &mv);
		CHECK(mv == 55, "shadow value %u", mv);
		CHECK(cbCount == 0, "callback ran on the audio core");
		lxr_dispatch_param_events();
		CHECK(cbCount == 1 && cbId == PAR_VOL1 && cbValue == 55, "dispatch: %u calls id %u value %u", cbCount, cbId, cbValue);
		CHECK(lxr_midi_param_set(PAR_MIX_MOD_1, 9) == -1, "midi out-of-range accepted");

		/* a note sounds in the very next Block, without a queue round trip */
		lxr_midi_trigger_note(3, 60, 120);
		lxr_engine_render(block, LXR_BLOCK_FRAMES);
		int pk = 0;
		for(int i = 0; i < LXR_BLOCK_FRAMES * 2; i++) if(abs(block[i]) > pk) pk = abs(block[i]);
		CHECK(pk > 100, "midi note not in the next Block (peak %d)", pk);

		/* an uncollected event ring drops notifications, never the change itself */
		for(int i = 0; i < 100; i++) lxr_midi_param_set(PAR_PAN1, (uint8_t)i);
		lxr_get_stats(&st);
		CHECK(st.event_drops == 100 - 64, "event drops %u", st.event_drops);
		lxr_param_get(PAR_PAN1, &mv);
		CHECK(mv == 99, "pan1 %u after a full event ring", mv);
		lxr_dispatch_param_events();
		lxr_set_param_callback(NULL, NULL);
	}

	/* UI layers: both are notified, init and poll are called */
	static const ui_t uiA = { "a", uiAInitFn, NULL, uiAChanged };
	static const ui_t uiB = { "b", NULL, uiBPollFn, uiBChanged };
	CHECK(ui_count() == 0, "UI registry not empty at start");
	CHECK(ui_register(&uiA) == 0 && ui_register(&uiB) == 0, "register failed");
	ui_init_all();
	ui_poll_all();
	lxr_param_set(vol1->id, 33);
	CHECK(uiAInit == 1 && uiBPoll == 1, "init/poll calls: %d %d", uiAInit, uiBPoll);
	CHECK(uiAChanges == 1 && uiBChanges == 1, "UI change notifications: %d %d", uiAChanges, uiBChanges);
	CHECK(ui_register(&uiA) == 0 && ui_register(&uiA) == 0 && ui_register(&uiA) == -1, "UI_MAX_LAYERS not enforced");

	if(failures) { printf("%d check(s) failed\n", failures); return 1; }
	printf("engine api ok\n");
	return 0;
}

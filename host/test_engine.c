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

	/* set / get round trip */
	const lxr_param_info_t *vol1 = lxr_param_find("vol1");
	CHECK(vol1 != NULL, "vol1 missing");
	uint8_t v = 0;
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

	/* stats */
	lxr_stats_report_block(300, 0);
	lxr_stats_report_block(900, 1);
	lxr_stats_count_midi_error();
	lxr_get_stats(&st);
	CHECK(st.worst_block_us == 900 && st.underruns == 1 && st.midi_errors == 1, "stats worst %u underruns %u midi %u", st.worst_block_us, st.underruns, st.midi_errors);

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

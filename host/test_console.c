/*
 * test_console.c: console command tests against the host engine (task 7.4).
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
#include "ui_iface.h"
#include "console/console.h"

static const char *input;
static char output[64 * 1024];
static size_t outLen;
static int txBusy;  /* simulate a busy transmitter */

static int readFn(void) { return (input && *input) ? (unsigned char)*input++ : -1; }

static int writeFn(char c)
{
	if(txBusy) return -1;
	if(outLen + 1 < sizeof output) { output[outLen++] = c; output[outLen] = 0; }
	return 0;
}

static int16_t block[LXR_BLOCK_FRAMES * 2];

/** Runs one or more input lines and returns the console output they produced. */
static const char *run(const char *lines)
{
	outLen = 0;
	output[0] = 0;
	input = lines;
	for(int i = 0; i < 200 && (*input || i < 50); i++)
	{
		ui_poll_all();
		lxr_engine_render(block, LXR_BLOCK_FRAMES);
	}
	return output;
}

static int failures;
#define CHECK(cond, ...) \
	do { if(!(cond)) { failures++; printf("FAIL %s:%d: ", __func__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while(0)
#define HAS(text) (strstr(output, (text)) != NULL)

int main(void)
{
	static const console_io_t io = { readFn, writeFn };
	lxr_engine_init(44100);
	console_set_io(&io);
	ui_register(&console_ui);
	ui_init_all();
	run("");

	run("help\n");
	CHECK(HAS("params") && HAS("trigger") && HAS("status"), "help: %s", output);

	run("set vol1 100\n");
	CHECK(HAS("vol1=100"), "set: %s", output);
	uint8_t v = 0;
	lxr_param_get(lxr_param_find("vol1")->id, &v);
	CHECK(v == 100, "engine value after set is %u", v);

	run("get vol1\n");
	CHECK(HAS("vol1=100"), "get: %s", output);

	run("set filter_type_1 hp\n");
	CHECK(HAS("filter_type_1=1 (HP)"), "set enum by name: %s", output);

	run("set vol1 200\n");
	CHECK(HAS("error: value out of range 0..127"), "range error: %s", output);
	lxr_param_get(lxr_param_find("vol1")->id, &v);
	CHECK(v == 100, "out-of-range set changed the value to %u", v);

	run("set nosuch 1\n");
	CHECK(HAS("error: unknown param 'nosuch'"), "unknown param: %s", output);

	run("set filter_type_1 banana\n");
	CHECK(HAS("error: 'banana' is not a value of filter_type_1"), "bad enum name: %s", output);

	run("set vol1\n");
	CHECK(HAS("error: usage: set"), "usage: %s", output);

	run("params snare\n");
	CHECK(HAS("velod4=") && !HAS("vol1="), "params snare: %s", output);

	run("params global\n");
	CHECK(HAS("fx_type=") && !HAS("vol1="), "params global: %s", output);

	run("params banana\n");
	CHECK(HAS("error: unknown voice 'banana'"), "params bad voice: %s", output);

	run("trigger snare 120\n");
	CHECK(HAS("ok"), "trigger: %s", output);
	int peak = 0;
	for(int b = 0; b < 20; b++)
	{
		lxr_engine_render(block, LXR_BLOCK_FRAMES);
		for(int i = 0; i < LXR_BLOCK_FRAMES * 2; i++) if(abs(block[i]) > peak) peak = abs(block[i]);
	}
	CHECK(peak > 200, "trigger produced no sound (peak %d)", peak);

	run("trigger banana\n");
	CHECK(HAS("error: unknown voice 'banana'"), "trigger bad voice: %s", output);
	run("trigger d1 0\n");
	CHECK(HAS("error: velocity must be 1..127"), "trigger bad velocity: %s", output);

	run("watch on\nset vol2 55\nwatch off\n");
	CHECK(HAS("watch on") && HAS("watch vol2=55"), "watch: %s", output);
	/* a change from MIDI or elsewhere is reported too */
	run("watch on\n");
	lxr_param_set(lxr_param_find("pan1")->id, 10);
	run("");
	CHECK(HAS("watch pan1=10"), "watch external change: %s", output);
	run("watch off\n");

	run("status\n");
	CHECK(HAS("worst_block_us") && HAS("midi_errors"), "status: %s", output);

	run("frobnicate\n");
	CHECK(HAS("error: unknown command 'frobnicate'"), "unknown command: %s", output);

	char longLine[200];
	memset(longLine, 'x', 150);
	strcpy(longLine + 150, "\n");
	run(longLine);
	CHECK(HAS("error: line longer than 80"), "long line: %s", output);

	run("gett\b vol1\n");
	CHECK(HAS("vol1=100"), "backspace: %s", output);

	/* a busy transmitter never blocks the console, output is dropped instead */
	txBusy = 1;
	for(int i = 0; i < 20; i++) run("help\n");
	CHECK(console_dropped_chars() > 0, "full output queue did not drop");
	txBusy = 0;
	for(int i = 0; i < 10; i++) run("");  /* let the queued text drain */
	run("get vol1\n");
	CHECK(HAS("vol1=100"), "console stuck after a full queue: %.80s", output);

	if(failures) { printf("%d check(s) failed\n", failures); return 1; }
	printf("console ok\n");
	return 0;
}

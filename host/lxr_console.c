/*
 * lxr_console.c: the serial console on stdin/stdout, driving the host engine
 * (requirement R7.6). Each loop pass renders one Block so queued changes apply.
 *
 *   echo "set vol1 100" | build/host/lxr_console
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */
#include <stdio.h>
#include "lxr/engine.h"
#include "ui_iface.h"
#include "console/console.h"

static int eof;

static int readStdin(void)
{
	if(eof) return -1;
	const int c = getchar();
	if(c == EOF) { eof = 1; return -1; }
	return c;
}

static int writeStdout(char c)
{
	if(c == '\r') return 0; /* the console sends CR LF for serial terminals */
	return putchar(c) == EOF ? -1 : 0;
}

int main(void)
{
	static const console_io_t io = { readStdin, writeStdout };
	static int16_t block[LXR_BLOCK_FRAMES * 2];

	lxr_engine_init(44100);
	console_set_io(&io);
	ui_register(&console_ui);
	ui_init_all();

	while(!eof)
	{
		ui_poll_all();
		lxr_engine_render(block, LXR_BLOCK_FRAMES);
	}
	/* flush what is left */
	for(int i = 0; i < 64; i++)
		ui_poll_all();
	return 0;
}

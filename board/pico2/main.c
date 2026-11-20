/*
 * main.c: board entry point for the Pico 2 build.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */
#include "pico/stdlib.h"

int main(void)
{
	/* Skeleton: the engine, MIDI input, audio output and console are added by
	 * the following tasks of .kiro/specs/1-move-this-repo-over/tasks.md. */
	for (;;) {
		tight_loop_contents();
	}
}

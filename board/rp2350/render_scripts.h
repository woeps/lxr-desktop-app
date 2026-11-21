/*
 * render_scripts.h: the host render scripts, compiled in for the `render`
 * console command (task 14.1). The table is generated from host/scripts/*.txt
 * by host/scripts/script_to_c.py at build time.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_RENDER_SCRIPTS_H_
#define LXR_RENDER_SCRIPTS_H_

#include <stdint.h>
#include <stddef.h>

typedef struct {
	uint32_t ms;            /* time from the start in milliseconds */
	const char *set_name;   /* parameter name for a "set" event, NULL for MIDI bytes */
	uint8_t set_value;
	uint8_t nbytes;
	uint8_t bytes[32];
} render_event_t;

typedef struct {
	const char *name;       /* script file name without .txt */
	uint32_t blocks;        /* render length in Blocks */
	const render_event_t *events;
	uint32_t count;
} render_script_t;

extern const render_script_t render_scripts[];
extern const unsigned render_script_count;

#endif /* LXR_RENDER_SCRIPTS_H_ */

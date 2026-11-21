/*
 * offline_render.h: the `render` console command (task 14.1).
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_OFFLINE_RENDER_H_
#define LXR_OFFLINE_RENDER_H_

/** Adds the `render` command to the console. */
void offline_render_init(void);

/** At boot: the script index of a pending render request (and clears it), or -1. */
int offline_render_requested(void);

/** Renders script `index` with the freshly initialised engine and sends it over USB,
 *  then restarts. Call instead of the normal start-up, after lxr_engine_init and
 *  console_usb_init, before core 1 is started. */
void offline_render_run(int index) __attribute__((noreturn));

#endif /* LXR_OFFLINE_RENDER_H_ */

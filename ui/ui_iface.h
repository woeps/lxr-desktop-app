/*
 * ui_iface.h: the interface every user interface layer implements.
 *
 * A UI talks to the engine only through lxr/engine.h. With no UI registered the
 * module boots and plays from MIDI.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef UI_IFACE_H_
#define UI_IFACE_H_

#include <stdint.h>

#define UI_MAX_LAYERS 4

typedef struct {
	const char *name;
	/** Called once from ui_init_all(), before the main loop. May be NULL. */
	void (*init)(void);
	/** Called repeatedly from the control core's main loop. Must not block. May be NULL. */
	void (*poll)(void);
	/** Called after any parameter changed, from whichever context changed it. Must be short. May be NULL. */
	void (*on_param_changed)(uint16_t id, uint8_t value);
} ui_t;

/** Adds a UI layer. Returns 0, or -1 if UI_MAX_LAYERS are already registered. The pointer must stay valid. */
int ui_register(const ui_t *ui);

/** Calls init() of every registered UI and hooks the engine's parameter-change callback to them. */
void ui_init_all(void);

/** Calls poll() of every registered UI. */
void ui_poll_all(void);

/** Number of registered UIs. */
int ui_count(void);

#endif /* UI_IFACE_H_ */

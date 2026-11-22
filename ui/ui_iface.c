/*
 * ui_iface.c: registry of UI layers and fan-out of parameter changes.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "ui_iface.h"
#include "lxr/engine.h"
#include "lxr/preset.h"

static const ui_t *layers[UI_MAX_LAYERS];
static int layerCount;

int ui_register(const ui_t *ui)
{
	if(!ui || layerCount >= UI_MAX_LAYERS)
		return -1;
	layers[layerCount++] = ui;
	return 0;
}

static void fanOut(uint16_t id, uint8_t value, void *user)
{
	(void)user;
	for(int i = 0; i < layerCount; i++)
	{
		if(layers[i]->on_param_changed)
			layers[i]->on_param_changed(id, value);
	}
}

void ui_init_all(void)
{
	for(int i = 0; i < layerCount; i++)
	{
		if(layers[i]->init)
			layers[i]->init();
	}
	lxr_set_param_callback(layerCount ? fanOut : NULL, NULL);
}

void ui_poll_all(void)
{
	/* parameter changes made by MIDI on the audio core reach the UIs here */
	lxr_dispatch_param_events();
	if(lxr_take_store_request())
	{
		/* runs with or without a UI layer, so a build without the console stores too */
		const int slot = lxr_preset_store_boot();
		for(int i = 0; i < layerCount; i++)
		{
			if(layers[i]->on_preset_stored)
				layers[i]->on_preset_stored(slot);
		}
	}
	for(int i = 0; i < layerCount; i++)
	{
		if(layers[i]->poll)
			layers[i]->poll();
	}
}

int ui_count(void)
{
	return layerCount;
}

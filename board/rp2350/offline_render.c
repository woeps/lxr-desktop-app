/*
 * offline_render.c: the `render` console command (task 14.1, requirement R5.5).
 *
 * Plays one of the compiled-in host render scripts through the MIDI parser and
 * the engine, exactly as host/lxr_render.c does, and sends the PCM over the USB
 * console. The engine has state that lxr_engine_init does not reset (delay
 * buffer, oscillator phases), so a render needs a fresh boot, like the host's
 * fresh process:
 *
 *   1. `render <script>` stores the request in watchdog scratch registers and restarts.
 *   2. The fresh boot skips the preset load, waits for the host to open the port,
 *      renders on core 1 (no I2S output) and sends from core 0:
 *        render begin <script> <blocks>
 *        R <512 hex digits: 64 stereo frames, int16 little endian, L R L R ...>
 *        render end <blocks>
 *   3. It restarts into normal operation.
 *
 * host/scripts/pico_render.py drives this and compares the result with the
 * host's golden WAV.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "offline_render.h"
#include "clocks.h"
#include "render_scripts.h"
#include "lxr/engine.h"
#include "console/console.h"
#include "Soundengine/MIDI/MidiParser.h"

#include <stdio.h>
#include <string.h>
#include <strings.h>
#include "pico/stdlib.h"
#include "pico/stdio.h"
#include "pico/stdio_usb.h"
#include "pico/multicore.h"
#include "hardware/watchdog.h"

#define RENDER_MAGIC 0x52454E44u   /* "REND" in watchdog scratch 0, script index in scratch 1 */
#define RING_BLOCKS 8u             /* power of two */

static int16_t ring[RING_BLOCKS][LXR_BLOCK_FRAMES * 2];
static volatile uint32_t ringHead;   /* core 1 */
static volatile uint32_t ringTail;   /* core 0 */
static volatile bool aborted;
static const render_script_t *script;

/* ---- core 1: the same loop as host/lxr_render.c ---- */

static void renderCore1(void)
{
	midiParser_reset();
	uint32_t next = 0;
	for(uint32_t b = 0; b < script->blocks && !aborted; b++)
	{
		const uint64_t blockStartMs = (uint64_t)b * LXR_BLOCK_FRAMES * 1000u / LXR_SAMPLE_RATE;
		while(next < script->count && script->events[next].ms <= blockStartMs)
		{
			const render_event_t *e = &script->events[next++];
			if(e->set_name)
			{
				const lxr_param_info_t *p = lxr_param_find(e->set_name);
				if(p)
					lxr_midi_param_set(p->id, e->set_value);
			}
			else
			{
				for(unsigned i = 0; i < e->nbytes; i++)
					midiParser_parseUartData(e->bytes[i]);
			}
		}
		while(ringHead - __atomic_load_n(&ringTail, __ATOMIC_ACQUIRE) >= RING_BLOCKS && !aborted)
			tight_loop_contents();
		lxr_engine_render(ring[ringHead & (RING_BLOCKS - 1u)], LXR_BLOCK_FRAMES);
		__atomic_store_n(&ringHead, ringHead + 1u, __ATOMIC_RELEASE);
	}
	for(;;)
		__wfi();
}

/* ---- core 0 ---- */

static uint32_t nowMs(void)
{
	return to_ms_since_boot(get_absolute_time());
}

static void cmdRender(int argc, char **argv)
{
	const char *name = argc > 1 ? argv[1] : NULL;
	int index = -1;
	for(unsigned i = 0; i < render_script_count && name; i++)
		if(strcasecmp(name, render_scripts[i].name) == 0) index = (int)i;
	if(index < 0)
	{
		console_print("error: usage: render <script>, scripts:");
		for(unsigned i = 0; i < render_script_count; i++)
		{
			console_print(" ");
			console_print(render_scripts[i].name);
		}
		console_print("\r\n");
		return;
	}
	console_print("render: restarting into render mode, reopen the port\r\n");
	console_flush(500, nowMs);
	sleep_ms(100);
	watchdog_hw->scratch[0] = RENDER_MAGIC;
	watchdog_hw->scratch[1] = (uint32_t)index;
	watchdog_reboot(0, 0, 0);
	for(;;)
		tight_loop_contents();
}

int offline_render_requested(void)
{
	if(watchdog_hw->scratch[0] != RENDER_MAGIC)
		return -1;
	watchdog_hw->scratch[0] = 0;   /* one render per request, also after a crash */
	const uint32_t index = watchdog_hw->scratch[1];
	return index < render_script_count ? (int)index : -1;
}

void offline_render_run(int index)
{
	script = &render_scripts[index];
	char line[2 + LXR_BLOCK_FRAMES * 2 * 2 * 2 + 3];

	/* the host reopens the port after the restart */
	const uint32_t t0 = nowMs();
	while(!stdio_usb_connected() && nowMs() - t0 < 15000u)
		sleep_ms(10);
	sleep_ms(200);

	if(stdio_usb_connected())
	{
		int n = snprintf(line, sizeof line, "render begin %s %lu\r\n", script->name, (unsigned long)script->blocks);
		stdio_put_string(line, n, false, false);

		ringHead = ringTail = 0;
		aborted = false;
		multicore_launch_core1(renderCore1);

		static const char hex[] = "0123456789ABCDEF";
		for(uint32_t b = 0; b < script->blocks; b++)
		{
			while(__atomic_load_n(&ringHead, __ATOMIC_ACQUIRE) == ringTail)
				tight_loop_contents();
			const uint8_t *pcm = (const uint8_t *)ring[ringTail & (RING_BLOCKS - 1u)];
			char *p = line;
			*p++ = 'R';
			*p++ = ' ';
			for(unsigned i = 0; i < LXR_BLOCK_FRAMES * 2 * 2; i++)
			{
				*p++ = hex[pcm[i] >> 4];
				*p++ = hex[pcm[i] & 15];
			}
			*p++ = '\r';
			*p++ = '\n';
			__atomic_store_n(&ringTail, ringTail + 1u, __ATOMIC_RELEASE);
			if(!stdio_usb_connected())
			{
				aborted = true;
				break;
			}
			stdio_put_string(line, (int)(p - line), false, false);
		}
		n = snprintf(line, sizeof line, aborted ? "render aborted\r\n" : "render end %lu\r\n", (unsigned long)script->blocks);
		stdio_put_string(line, n, false, false);
		stdio_flush();
		sleep_ms(300);
	}
	watchdog_reboot(0, 0, 0);
	for(;;)
		tight_loop_contents();
}

void offline_render_init(void)
{
	console_add_command("render", "render <script>  restart, play a host test script, send the PCM, restart", cmdRender);
}

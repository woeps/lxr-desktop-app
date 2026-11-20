/*
 * main.c: board entry point for the Pico 2.
 *
 * Core 0 (control): MIDI input, UI layers (console on USB), flash saves, USB stack.
 * Core 1 (audio):   I2S output, renders one Block per DMA buffer.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */
#include "pico/stdlib.h"
#include "pico/multicore.h"
#include "hardware/clocks.h"
#include "hardware/vreg.h"

#include "pins.h"
#include "clocks.h"
#include "audio_i2s.h"
#include "console_usb.h"
#include "lxr/engine.h"
#include "ui_iface.h"
#include "console/console.h"

#ifndef LXR_ENABLE_CONSOLE
#define LXR_ENABLE_CONSOLE 1
#endif

/* LXR_BOOT_DEMO=1: play every voice once after boot (hardware check without MIDI or console). */
#ifndef LXR_BOOT_DEMO
#define LXR_BOOT_DEMO 0
#endif

static void audioCoreMain(void)
{
	audio_i2s_init(clock_get_hz(clk_sys));
	audio_i2s_start();
	audio_i2s_run();
}

static void setClock(void)
{
	if(LXR_SYS_CLOCK_KHZ != 150000)
	{
		vreg_set_voltage(LXR_VREG_VOLTAGE);
		sleep_ms(10); /* let the regulator settle before raising the clock */
		set_sys_clock_khz(LXR_SYS_CLOCK_KHZ, true);
	}
}

int main(void)
{
	setClock();

#ifdef LXR_PIN_LED
	gpio_init(LXR_PIN_LED);
	gpio_set_dir(LXR_PIN_LED, GPIO_OUT);
#endif

	lxr_engine_init(LXR_SAMPLE_RATE);

#if LXR_ENABLE_CONSOLE
	console_usb_init();
	ui_register(&console_ui);
#endif
	ui_init_all();

	multicore_launch_core1(audioCoreMain);

#if LXR_BOOT_DEMO
	for(int v = 0; v < LXR_NUM_VOICE_SLOTS; v++)
	{
		lxr_trigger((lxr_voice_t)v, 110);
		sleep_ms(400);
	}
#endif

	absolute_time_t nextBlink = make_timeout_time_ms(500);
	bool led = false;
	for(;;)
	{
		ui_poll_all();

		if(time_reached(nextBlink))
		{
			led = !led;
#ifdef LXR_PIN_LED
			gpio_put(LXR_PIN_LED, led);
#endif
			nextBlink = make_timeout_time_ms(500);
		}
	}
}

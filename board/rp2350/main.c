/*
 * main.c: board entry point for the Pico 2.
 *
 * Core 0 (control): UI layers (console on USB), flash saves, USB stack.
 * Core 1 (audio):   MIDI input (parsed before each Block), I2S output, renders one Block per DMA buffer.
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
#include "hardware/adc.h"

#include "pins.h"
#include "clocks.h"
#include "audio_i2s.h"
#include "console_usb.h"
#include "midi_uart.h"
#include "preset_flash.h"
#include "offline_render.h"
#include "lxr/preset.h"
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
	audio_i2s_run(midi_uart_poll);   /* MIDI is parsed on this core, between Blocks */
}

/** Die temperature in 0.1 degC from the on-chip sensor (RP2350 datasheet: 27 degC at 0.706 V, -1.721 mV/degC). */
static int16_t readTemperature(void)
{
	adc_select_input(ADC_TEMPERATURE_CHANNEL_NUM);
	uint32_t sum = 0;
	for(int i = 0; i < 16; i++)
		sum += adc_read();
	const float volts = (float)sum / 16.0f * 3.3f / 4096.0f;
	const float celsius = 27.0f - (volts - 0.706f) / 0.001721f;
	return (int16_t)(celsius * 10.0f);
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
	/* a `render` request from before the restart: fresh engine, no preset, no audio output */
	const int renderScript = offline_render_requested();
	if(renderScript >= 0)
	{
		console_usb_init();
		offline_render_run(renderScript);
	}
#endif

	/* saved MIDI settings and the last used preset, or the factory sound (R8.3) */
	if(preset_flash_init() == 0)
		lxr_preset_boot();

	adc_init();
	adc_set_temp_sensor_enabled(true);
	lxr_stats_report_board(clock_get_hz(clk_sys) / 1000u, readTemperature());

#if LXR_ENABLE_CONSOLE
	console_usb_init();
	ui_register(&console_ui);
	offline_render_init();
#endif
	ui_init_all();

	midi_uart_init();

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
			if(led)
				lxr_stats_report_board(clock_get_hz(clk_sys) / 1000u, readTemperature());
			lxr_stats_report_midi_line(gpio_get(LXR_PIN_MIDI_RX), midi_uart_line_edges());
			uint32_t midiRegs[3];
			midi_uart_debug(midiRegs);
			lxr_stats_report_midi_debug(midiRegs);
		}
	}
}

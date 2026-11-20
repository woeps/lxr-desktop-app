/*
 * pins.h: every GPIO the module uses (requirement R7.5, design section 6.4).
 *
 * Valid for the Waveshare RP2350-Zero (default board) and the Raspberry Pi
 * Pico 2: all pins below are on the edge headers of both boards.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_PINS_H_
#define LXR_PINS_H_

/* DIN MIDI input (UART0 RX), from the 6N138 output. */
#define LXR_PIN_MIDI_RX      1
#define LXR_MIDI_UART        uart0

/* The serial console uses the board's USB port (USB CDC), no pins. */

/* PCM5102A I2S DAC. LRCK must be BCK + 1 (PIO side-set pins). */
#define LXR_PIN_I2S_DIN      9
#define LXR_PIN_I2S_BCK      10
#define LXR_PIN_I2S_LRCK     11

/* Status LED: a plain LED where the board has one (Pico 2: GP25). The
 * RP2350-Zero has a WS2812 on GP16 instead, which the firmware does not drive. */
#ifdef PICO_DEFAULT_LED_PIN
#define LXR_PIN_LED          PICO_DEFAULT_LED_PIN
#endif

/* Reserved for the later encoder + OLED UI (edge pins on both boards):
 * GP12, GP13, GP14 encoder A, B, push; GP6, GP7 I2C1 SDA, SCL. */

#endif /* LXR_PINS_H_ */

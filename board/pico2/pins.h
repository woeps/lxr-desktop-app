/*
 * pins.h: every GPIO the module uses (requirement R7.5, design section 6.4).
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

/* Serial console (UART1), to a USB-serial adapter or the Pico Debug Probe. */
#define LXR_PIN_CONSOLE_TX   4
#define LXR_PIN_CONSOLE_RX   5
#define LXR_CONSOLE_UART     uart1
#define LXR_CONSOLE_BAUD     115200

/* PCM5102A I2S DAC. LRCK must be BCK + 1 (PIO side-set pins). */
#define LXR_PIN_I2S_DIN      9
#define LXR_PIN_I2S_BCK      10
#define LXR_PIN_I2S_LRCK     11

/* On-board LED (heartbeat). */
#define LXR_PIN_LED          25

/* GP12..GP15, GP18, GP19 are reserved for the later encoder + OLED UI. */

#endif /* LXR_PINS_H_ */

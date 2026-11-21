/*
 * midi_uart.h: Serial MIDI input (3.5 mm TRS, Type A) on UART0 RX with a DMA ring (design section 8).
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_MIDI_UART_H_
#define LXR_MIDI_UART_H_

/** Sets up UART0 at 31250 baud and starts the receive DMA. Control core. */
void midi_uart_init(void);

/** Feeds received bytes to the MIDI parser. Call often from the control core's main loop. */
void midi_uart_poll(void);

#endif /* LXR_MIDI_UART_H_ */

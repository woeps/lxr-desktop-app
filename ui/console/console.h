/*
 * console.h: line-based text console UI (requirement R7).
 *
 * The console reads characters from and writes characters to two function
 * pointers, so the same code runs on a Pico UART and on stdin/stdout. It calls
 * only the Engine API.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef CONSOLE_H_
#define CONSOLE_H_

#include "ui_iface.h"

#define CONSOLE_LINE_MAX 80
#define CONSOLE_TX_SIZE 1024   /* power of two */

typedef struct {
	/** Next received character, or -1 if none is waiting. Must not block. */
	int (*read_char)(void);
	/** Sends one character. Returns 0 if accepted, -1 if the transmitter is busy. Must not block. */
	int (*write_char)(char c);
} console_io_t;

/** Sets the I/O functions. Call before ui_register(&console_ui). */
void console_set_io(const console_io_t *io);

/** Reads and executes complete lines, and drains queued output. Called by ui_poll_all(). */
void console_poll(void);

/** Characters dropped because the output queue was full. */
uint32_t console_dropped_chars(void);

/** The console as a UI layer. */
extern const ui_t console_ui;

#endif /* CONSOLE_H_ */

/*
 * console_usb.c: connects the console UI to the USB serial port (USB CDC).
 *
 * The SDK's stdio_usb runs the TinyUSB device stack in the background on
 * core 0. Writes never block: a character is only handed over when the CDC
 * transmit buffer has room, otherwise the console keeps it queued. With no
 * terminal attached, output is dropped by the console's own queue.
 * stdio_usb also provides the reset-to-BOOTSEL interface, so `picotool load -f`
 * can flash the module without pressing the BOOT button.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "console_usb.h"
#include "console/console.h"

#include "pico/stdio.h"
#include "pico/stdio_usb.h"
#include "tusb.h"

static int readChar(void)
{
	const int c = getchar_timeout_us(0);
	return c < 0 ? -1 : c;
}

static int writeChar(char c)
{
	/* Only core 0 writes and the USB task only drains, so free space seen here
	 * cannot shrink before putchar_raw runs, which then never waits. */
	if(!stdio_usb_connected() || tud_cdc_write_available() == 0)
		return -1;
	putchar_raw(c);
	return 0;
}

static const console_io_t io = { readChar, writeChar };

void console_usb_init(void)
{
	stdio_usb_init();
	console_set_io(&io);
}

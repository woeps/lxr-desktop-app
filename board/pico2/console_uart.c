/*
 * console_uart.c: connects the console UI to UART1 (requirement R7.2).
 * Non-blocking in both directions: the UART FIFOs (32 bytes each) are polled
 * from the control core's main loop.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "console_uart.h"
#include "pins.h"
#include "console/console.h"

#include "hardware/uart.h"
#include "hardware/gpio.h"

static int readChar(void)
{
	return uart_is_readable(LXR_CONSOLE_UART) ? (int)uart_getc(LXR_CONSOLE_UART) : -1;
}

static int writeChar(char c)
{
	if(!uart_is_writable(LXR_CONSOLE_UART))
		return -1;
	uart_putc_raw(LXR_CONSOLE_UART, c);
	return 0;
}

static const console_io_t io = { readChar, writeChar };

void console_uart_init(void)
{
	uart_init(LXR_CONSOLE_UART, LXR_CONSOLE_BAUD);
	uart_set_format(LXR_CONSOLE_UART, 8, 1, UART_PARITY_NONE);
	uart_set_fifo_enabled(LXR_CONSOLE_UART, true);
	gpio_set_function(LXR_PIN_CONSOLE_TX, GPIO_FUNC_UART);
	gpio_set_function(LXR_PIN_CONSOLE_RX, GPIO_FUNC_UART);
	gpio_pull_up(LXR_PIN_CONSOLE_RX); /* idle high when no adapter is connected */
	console_set_io(&io);
}

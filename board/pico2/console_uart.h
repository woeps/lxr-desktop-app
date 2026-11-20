/*
 * console_uart.h: connects the console UI to UART1.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_CONSOLE_UART_H_
#define LXR_CONSOLE_UART_H_

/** Sets up UART1 on the console pins and hands it to the console UI. */
void console_uart_init(void);

#endif /* LXR_CONSOLE_UART_H_ */

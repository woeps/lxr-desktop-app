/*
 * clocks.h: system clock and core voltage (design section 9).
 *
 * 150 MHz at the default 1.10 V is the RP2350's rated clock. Raise it only
 * through the overclock steps of task 9.5, which also fixes the limits
 * (at most 250 MHz, at most 1.20 V, die temperature below 70 degC).
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_CLOCKS_H_
#define LXR_CLOCKS_H_

#ifndef LXR_SYS_CLOCK_KHZ
#define LXR_SYS_CLOCK_KHZ    150000
#endif

/* Core voltage for the clock above, as a hardware/vreg.h VREG_VOLTAGE_x_yy name. */
#ifndef LXR_VREG_VOLTAGE
#define LXR_VREG_VOLTAGE     VREG_VOLTAGE_1_10
#endif

#define LXR_SAMPLE_RATE      44100

#endif /* LXR_CLOCKS_H_ */

/*
 * clocks.h: system clock and core voltage (design section 9).
 *
 * The RP2350 is rated for 150 MHz. That misses the render budget under full
 * load (1149 us per Block), so the module runs at 250 MHz at the stock 1.10 V:
 * 689 us worst case, 10-minute soak without underruns at 41.5 degC (task 9.5,
 * docs/memory-map.md section 9). Limits: at most 250 MHz, at most 1.20 V.
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
#define LXR_SYS_CLOCK_KHZ    250000
#endif

/* Core voltage for the clock above, as a hardware/vreg.h VREG_VOLTAGE_x_yy name. */
#ifndef LXR_VREG_VOLTAGE
#define LXR_VREG_VOLTAGE     VREG_VOLTAGE_1_10
#endif

#define LXR_SAMPLE_RATE      44100

#endif /* LXR_CLOCKS_H_ */

/*
 * random.h: deterministic pseudo-random numbers for the DSP code.
 *
 * Copyright (C) 2012-2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef RANDOM_H_
#define RANDOM_H_

#include "Soundengine/platform.h"

/** Seeds the generator. A fixed seed makes renders reproducible (host golden tests). */
void initRng();

/** Returns the next 32-bit pseudo-random value (xorshift32). Audio core only. */
uint32_t GetRngValue();

#endif /* RANDOM_H_ */

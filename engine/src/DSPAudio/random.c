/*
 * random.c: xorshift32 generator, replacing the STM32 hardware RNG.
 *
 * Copyright (C) 2012-2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "Soundengine/DSPAudio/random.h"

static uint32_t rngState = 0x2545F491u;

void initRng()
{
	rngState = 0x2545F491u;
}

uint32_t GetRngValue()
{
	uint32_t x = rngState;
	x ^= x << 13;
	x ^= x >> 17;
	x ^= x << 5;
	rngState = x;
	return x;
}

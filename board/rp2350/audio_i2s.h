/*
 * audio_i2s.h: PIO I2S output with two DMA buffers in ping-pong (design 6.1).
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_AUDIO_I2S_H_
#define LXR_AUDIO_I2S_H_

#include <stdint.h>

/** Sets up PIO and DMA for the given system clock. Call on the audio core. */
void audio_i2s_init(uint32_t sys_clock_hz);

/** Renders both buffers once and starts the output. */
void audio_i2s_start(void);

/** Runs forever on the audio core: waits for a free buffer, renders a Block into it. */
void audio_i2s_run(void) __attribute__((noreturn));

#endif /* LXR_AUDIO_I2S_H_ */

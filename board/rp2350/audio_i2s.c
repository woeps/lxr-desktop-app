/*
 * audio_i2s.c: PIO I2S output with two DMA buffers in ping-pong (design 6.1).
 *
 * Two DMA channels each move one Block (64 stereo frames, one 32-bit word per
 * frame) to the PIO TX FIFO and chain to each other. When a channel finishes,
 * its buffer is free: the IRQ (on the audio core) rewinds the channel's read
 * address and flags the buffer, and the render loop fills it while the other
 * channel plays.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "audio_i2s.h"
#include "pins.h"
#include "clocks.h"
#include "lxr/engine.h"

#include "pico/stdlib.h"
#include "hardware/pio.h"
#include "hardware/dma.h"
#include "hardware/irq.h"
#include "hardware/clocks.h"
#include "hardware/sync.h"
#include "i2s.pio.h"

static uint32_t buffers[2][LXR_BLOCK_FRAMES] __attribute__((aligned(8)));
static int dmaChannel[2];
static PIO pio = pio0;
static uint sm;

/* bit i set: buffer i has been played and must be rendered again */
static volatile uint32_t freeMask;

static void __not_in_flash_func(dmaIrq)(void)
{
	for(int i = 0; i < 2; i++)
	{
		const uint32_t bit = 1u << dmaChannel[i];
		if(dma_hw->ints1 & bit)
		{
			dma_hw->ints1 = bit;
			dma_channel_set_read_addr((uint)dmaChannel[i], buffers[i], false);
			if(freeMask & (1u << i))
				lxr_stats_report_block(0, 1);   /* not rendered in time: it plays the old Block again */
			freeMask |= 1u << i;
		}
	}
}

void audio_i2s_init(uint32_t sys_clock_hz)
{
	const uint offset = pio_add_program(pio, &lxr_i2s_program);
	sm = (uint)pio_claim_unused_sm(pio, true);

	pio_gpio_init(pio, LXR_PIN_I2S_DIN);
	pio_gpio_init(pio, LXR_PIN_I2S_BCK);
	pio_gpio_init(pio, LXR_PIN_I2S_LRCK);
	lxr_i2s_program_init(pio, sm, offset, LXR_PIN_I2S_DIN, LXR_PIN_I2S_BCK);

	/* two PIO cycles per bit, 32 bits per frame */
	const float div = (float)sys_clock_hz / (float)(2u * 32u * LXR_SAMPLE_RATE);
	pio_sm_set_clkdiv(pio, sm, div);

	dmaChannel[0] = dma_claim_unused_channel(true);
	dmaChannel[1] = dma_claim_unused_channel(true);
	for(int i = 0; i < 2; i++)
	{
		dma_channel_config c = dma_channel_get_default_config((uint)dmaChannel[i]);
		channel_config_set_transfer_data_size(&c, DMA_SIZE_32);
		channel_config_set_read_increment(&c, true);
		channel_config_set_write_increment(&c, false);
		channel_config_set_dreq(&c, pio_get_dreq(pio, sm, true));
		channel_config_set_chain_to(&c, (uint)dmaChannel[1 - i]);
		dma_channel_configure((uint)dmaChannel[i], &c, &pio->txf[sm], buffers[i], LXR_BLOCK_FRAMES, false);
	}

	/* DMA_IRQ_1, handled on the core that calls this (the audio core) */
	dma_hw->ints1 = (1u << dmaChannel[0]) | (1u << dmaChannel[1]);
	dma_irqn_set_channel_enabled(1, (uint)dmaChannel[0], true);
	dma_irqn_set_channel_enabled(1, (uint)dmaChannel[1], true);
	irq_set_exclusive_handler(DMA_IRQ_1, dmaIrq);
	irq_set_enabled(DMA_IRQ_1, true);
}

static void renderInto(int i)
{
	const uint32_t t0 = time_us_32();
	lxr_engine_render((int16_t *)buffers[i], LXR_BLOCK_FRAMES);
	lxr_stats_report_block(time_us_32() - t0, 0);
}

void audio_i2s_start(void)
{
	renderInto(0);
	renderInto(1);
	freeMask = 0;
	dma_channel_start((uint)dmaChannel[0]);
	pio_sm_set_enabled(pio, sm, true);
}

void __not_in_flash_func(audio_i2s_run)(void)
{
	for(;;)
	{
		uint32_t mask;
		while((mask = freeMask) == 0)
			__wfi();

		const int i = (mask & 1u) ? 0 : 1;
		renderInto(i);

		const uint32_t irqState = save_and_disable_interrupts();
		freeMask &= ~(1u << i);
		restore_interrupts(irqState);
	}
}

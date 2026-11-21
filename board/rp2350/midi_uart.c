/*
 * midi_uart.c: Serial MIDI input (3.5 mm TRS, Type A) on UART0 RX (design section 8).
 *
 * A DMA channel in endless mode copies every received UART data register
 * value (data byte plus the error flags in bits 8..11) into a 512-entry ring,
 * without CPU work. The audio core drains the ring before every Block
 * (midi_uart_poll is its before-block hook), so notes reach the next Block and
 * nothing on core 0 (flash erase, USB) can delay them. The ring holds 164 ms.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "midi_uart.h"
#include "pins.h"
#include "Soundengine/MIDI/MidiParser.h"

#include "hardware/uart.h"
#include "hardware/gpio.h"
#include "hardware/dma.h"
#include "hardware/regs/dma.h"

#define RING_ENTRIES   512u                  /* power of two */
#define RING_BYTES     (RING_ENTRIES * 4u)   /* 32-bit entries: native width of the UART data register */
#define RING_SIZE_BITS 11u                   /* log2(RING_BYTES) */

static uint32_t ring[RING_ENTRIES] __attribute__((aligned(RING_BYTES)));
static int dmaChannel;
static uint32_t tail;   /* next entry to read, 0..RING_ENTRIES-1 */
static volatile uint32_t lineEdges;

static void onRxEdge(uint gpio, uint32_t events)
{
	(void)gpio;
	if(events & GPIO_IRQ_EDGE_FALL)
		lineEdges++;
}

uint32_t midi_uart_line_edges(void)
{
	return lineEdges;
}

void midi_uart_init(void)
{
	uart_init(LXR_MIDI_UART, 31250);
	uart_set_format(LXR_MIDI_UART, 8, 1, UART_PARITY_NONE);
	uart_set_hw_flow(LXR_MIDI_UART, false, false);
	uart_set_fifo_enabled(LXR_MIDI_UART, true);
	gpio_set_function(LXR_PIN_MIDI_RX, GPIO_FUNC_UART);
	gpio_pull_up(LXR_PIN_MIDI_RX); /* line idles high; the H11L1 output also needs the external 1 kOhm pull-up */

	dmaChannel = dma_claim_unused_channel(true);
	dma_channel_config c = dma_channel_get_default_config((uint)dmaChannel);
	channel_config_set_transfer_data_size(&c, DMA_SIZE_32);   /* full DR: data byte + FE/PE/BE/OE flags */
	channel_config_set_read_increment(&c, false);
	channel_config_set_write_increment(&c, true);
	channel_config_set_ring(&c, true, RING_SIZE_BITS);        /* wrap the write address */
	channel_config_set_dreq(&c, uart_get_dreq(LXR_MIDI_UART, false));
	/* ENDLESS mode with a non-zero count field: the count does not decrement in this mode */
	dma_channel_configure((uint)dmaChannel, &c, ring, &uart_get_hw(LXR_MIDI_UART)->dr,
	                      (DMA_CH0_TRANS_COUNT_MODE_VALUE_ENDLESS << DMA_CH0_TRANS_COUNT_MODE_LSB) | 1u, true);
	tail = 0;
	midiParser_reset();

	/* edge counter on the same pin: shows whether the optocoupler switches at all */
	gpio_set_irq_enabled_with_callback(LXR_PIN_MIDI_RX, GPIO_IRQ_EDGE_FALL, true, onRxEdge);
}

void midi_uart_poll(void)
{
	const uintptr_t writeAddr = (uintptr_t)dma_channel_hw_addr((uint)dmaChannel)->write_addr;
	const uint32_t head = (uint32_t)((writeAddr - (uintptr_t)ring) / sizeof(ring[0])) & (RING_ENTRIES - 1u);

	/* bounded work per call keeps the main loop responsive */
	for(uint32_t n = 0; tail != head && n < 64u; n++)
	{
		midiParser_processRxWord((uint16_t)(ring[tail] & 0xFFFFu));
		tail = (tail + 1u) & (RING_ENTRIES - 1u);
	}
}

void midi_uart_debug(uint32_t out[3])
{
	out[0] = dma_channel_hw_addr((uint)dmaChannel)->ctrl_trig;
	out[1] = dma_channel_hw_addr((uint)dmaChannel)->transfer_count;
	out[2] = uart_get_hw(LXR_MIDI_UART)->fr;
}

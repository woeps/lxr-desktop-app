/*
 * preset_flash.c: preset storage in the last 17 sectors of the board's flash
 * (requirement R8, design section 7.3).
 *
 * The image runs from RAM (copy_to_ram), so the audio core never touches flash
 * and keeps rendering while core 0 erases and programs a sector. Core 0 runs
 * the flash routines with its own interrupts off; it must not use
 * flash_safe_execute, which would also pause the audio core. While core 0's
 * interrupts are off, MIDI bytes still land in the DMA ring (164 ms deep) and
 * the USB console just pauses.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "preset_flash.h"
#include "lxr/preset.h"

#include <string.h>
#include "pico/stdlib.h"
#include "hardware/flash.h"
#include "hardware/sync.h"

extern char __flash_binary_end;

static uint32_t sectorOffset(uint8_t index)
{
	return LXR_PRESET_SLOT_OFFSET(PICO_FLASH_SIZE_BYTES, index);   /* index 16 = globals, the last sector */
}

static int flashRead(uint8_t index, uint8_t buf[LXR_PRESET_SECTOR_SIZE])
{
	if(index > LXR_STORAGE_GLOBALS)
		return -1;
	memcpy(buf, (const void *)(XIP_BASE + sectorOffset(index)), LXR_PRESET_SECTOR_SIZE);
	return 0;
}

static int flashWrite(uint8_t index, const uint8_t buf[LXR_PRESET_SECTOR_SIZE])
{
	if(index > LXR_STORAGE_GLOBALS)
		return -1;
	const uint32_t offset = sectorOffset(index);
	const uint32_t t0 = time_us_32();
	const uint32_t irq = save_and_disable_interrupts();
	flash_range_erase(offset, LXR_PRESET_SECTOR_SIZE);
	flash_range_program(offset, buf, LXR_PRESET_SECTOR_SIZE);
	restore_interrupts(irq);
	lxr_stats_report_flash_write(time_us_32() - t0);
	return memcmp((const void *)(XIP_BASE + offset), buf, LXR_PRESET_SECTOR_SIZE) == 0 ? 0 : -1;
}

static const lxr_storage_t flashStorage = { flashRead, flashWrite };

int preset_flash_init(void)
{
	/* never let a save erase the firmware image */
	const uint32_t imageEnd = (uint32_t)((uintptr_t)&__flash_binary_end - XIP_BASE);
	if(imageEnd > sectorOffset(0))
		return -1;
	lxr_preset_set_storage(&flashStorage);
	return 0;
}

/*
 * preset.h: preset and globals sector images (requirement R8, design section 7).
 *
 * Pure data conversion, no flash access: the board layer erases and programs
 * the 4 KB sectors these functions fill or read.
 *
 * Sector layout (little endian), the rest of the sector is 0xFF (erased flash):
 *   0   magic   "LXRP" (sound preset) or "LXRG" (globals)
 *   4   version 1
 *   5   0 (reserved)
 *   6   payload length (uint16)
 *   8   name, 8 characters, space padded (globals: 8 zero bytes)
 *   16  payload
 *   16+len  CRC-32 (zlib / IEEE 802.3) over bytes 0 .. 16+len-1
 *
 * Preset payload: LXR_SOUND_PARAM_COUNT parameter bytes in id order, the same
 * bytes as the old LXR .SND kit files after their 8-byte name.
 * Globals payload: last-used slot, pair count, then (id uint16, value) pairs
 * for every public parameter at or above LXR_SOUND_PARAM_COUNT (MIDI settings).
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_PRESET_H_
#define LXR_PRESET_H_

#include <stdint.h>
#include <stddef.h>
#include "lxr/engine.h"

#define LXR_PRESET_SECTOR_SIZE 4096u
#define LXR_PRESET_SLOTS       16u
#define LXR_PRESET_NAME_LEN    8u
#define LXR_PRESET_VERSION     1u

/* Flash layout (design 7.1): the last 17 sectors of flash. Slots 0..15 first,
 * the globals sector last. Offsets are from the start of flash. */
#define LXR_PRESET_REGION_SECTORS (LXR_PRESET_SLOTS + 1u)
#define LXR_PRESET_SLOT_OFFSET(flash_size, slot) \
	((flash_size) - LXR_PRESET_REGION_SECTORS * LXR_PRESET_SECTOR_SIZE + (uint32_t)(slot) * LXR_PRESET_SECTOR_SIZE)
#define LXR_GLOBALS_OFFSET(flash_size) ((flash_size) - LXR_PRESET_SECTOR_SIZE)

typedef enum {
	LXR_PRESET_OK = 0,
	LXR_PRESET_BLANK = -1,    /* erased sector (first word 0xFFFFFFFF) */
	LXR_PRESET_CORRUPT = -2,  /* wrong magic, version, length or CRC */
} lxr_preset_status_t;

/** CRC-32 as used by zlib (reflected 0xEDB88320, init and final xor 0xFFFFFFFF). */
uint32_t lxr_crc32(const uint8_t *data, size_t len);

/** Fills a whole sector with a sound preset. name: up to 8 characters (NULL or shorter: space padded). */
void lxr_preset_pack(const char *name, const uint8_t values[LXR_SOUND_PARAM_COUNT], uint8_t sector[LXR_PRESET_SECTOR_SIZE]);

/** Reads a sound preset sector. On LXR_PRESET_OK, name (9 bytes incl. terminator, may be NULL) and values are set. */
lxr_preset_status_t lxr_preset_unpack(const uint8_t sector[LXR_PRESET_SECTOR_SIZE], char name[LXR_PRESET_NAME_LEN + 1],
                                      uint8_t values[LXR_SOUND_PARAM_COUNT]);

/** The factory sound (the LXR "Initkit"), clamped to the parameter ranges. */
void lxr_preset_factory(uint8_t values[LXR_SOUND_PARAM_COUNT]);

/** Fills a whole sector with the current MIDI settings and the last-used slot. */
void lxr_globals_pack(uint8_t last_slot, uint8_t sector[LXR_PRESET_SECTOR_SIZE]);

/** Reads a globals sector. On LXR_PRESET_OK the settings are applied through lxr_param_set
 *  (unknown ids and out-of-range values are skipped) and last_slot is set (clamped to 0..15). */
lxr_preset_status_t lxr_globals_unpack(const uint8_t sector[LXR_PRESET_SECTOR_SIZE], uint8_t *last_slot);

#endif /* LXR_PRESET_H_ */

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

/* ---- preset storage (control core) --------------------------------------------- */

/** Sector index of the globals sector for lxr_storage_t (slots are 0 .. LXR_PRESET_SLOTS-1). */
#define LXR_STORAGE_GLOBALS LXR_PRESET_SLOTS

/** Where sectors live. The board implements this (flash), the host tests use RAM. */
typedef struct {
	/** Copies sector `index` (0..16) into buf. Returns 0, or -1 on error. */
	int (*read)(uint8_t index, uint8_t buf[LXR_PRESET_SECTOR_SIZE]);
	/** Erases sector `index` and writes buf. Returns 0, or -1 on error. Must keep audio running. */
	int (*write)(uint8_t index, const uint8_t buf[LXR_PRESET_SECTOR_SIZE]);
} lxr_storage_t;

/** Sets the storage. Without one, load/save/name return -1. */
void lxr_preset_set_storage(const lxr_storage_t *storage);

/** Loads slot 0..15 into the engine. Returns LXR_PRESET_OK, LXR_PRESET_BLANK / CORRUPT (nothing changed),
 *  or -3 for no storage / bad slot. Remembers the slot in the globals sector as the boot slot. */
int lxr_preset_load(uint8_t slot);

/** Saves the current sound to slot 0..15 under name (8 characters, NULL keeps the slot's old name or
 *  uses "slotNN"), together with the MIDI settings and the slot as the boot slot. Returns 0 or -3. */
int lxr_preset_save(uint8_t slot, const char *name);

/** Name of slot 0..15 (9 bytes incl. terminator). Returns the slot's lxr_preset_status_t, or -3. */
int lxr_preset_name(uint8_t slot, char name[LXR_PRESET_NAME_LEN + 1]);

/** Boot: applies the saved MIDI settings and loads the last used slot. A blank or corrupt slot or
 *  globals sector loads the factory sound instead. Returns the loaded slot, or -1 for factory. */
int lxr_preset_boot(void);

/** Slot that the last load or save used (the boot slot), or -1 if none since boot. */
int lxr_preset_current(void);

/** Saves the live sound to the boot slot like `preset save <slot>` without a name (R11.2, R11.3):
 *  the loaded slot, else the slot the globals sector named at boot (0 if none). Keeps the slot's name.
 *  Returns the slot written, or LXR_PRESET_NO_STORAGE. Control core. */
int lxr_preset_store_boot(void);

#define LXR_PRESET_NO_STORAGE (-3)

#endif /* LXR_PRESET_H_ */

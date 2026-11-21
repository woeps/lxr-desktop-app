/*
 * preset.c: preset and globals sector images (requirement R8, design section 7).
 * See lxr/preset.h for the layout.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "lxr/preset.h"
#include "Preset/InitKit.h"

#include <string.h>

#define HEADER_SIZE 16u

static const char magicPreset[4] = { 'L', 'X', 'R', 'P' };
static const char magicGlobals[4] = { 'L', 'X', 'R', 'G' };

uint32_t lxr_crc32(const uint8_t *data, size_t len)
{
	uint32_t crc = 0xFFFFFFFFu;
	for(size_t i = 0; i < len; i++)
	{
		crc ^= data[i];
		for(int b = 0; b < 8; b++)
			crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
	}
	return crc ^ 0xFFFFFFFFu;
}

static void put16(uint8_t *p, uint16_t v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); }
static uint16_t get16(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }
static void put32(uint8_t *p, uint32_t v) { for(int i = 0; i < 4; i++) p[i] = (uint8_t)(v >> (8 * i)); }
static uint32_t get32(const uint8_t *p) { return p[0] | (p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24); }

/** Writes header, payload (already in place at sector + 16) and CRC; erases the rest. */
static void finish(const char magic[4], const char *name, uint16_t len, uint8_t *sector)
{
	memcpy(sector, magic, 4);
	sector[4] = LXR_PRESET_VERSION;
	sector[5] = 0;
	put16(sector + 6, len);
	memset(sector + 8, name ? ' ' : 0, LXR_PRESET_NAME_LEN);
	if(name)
	{
		for(unsigned i = 0; i < LXR_PRESET_NAME_LEN && name[i]; i++)
			sector[8 + i] = (uint8_t)name[i];
	}
	put32(sector + HEADER_SIZE + len, lxr_crc32(sector, HEADER_SIZE + len));
	memset(sector + HEADER_SIZE + len + 4, 0xFF, LXR_PRESET_SECTOR_SIZE - HEADER_SIZE - len - 4);
}

/** Checks blank, magic, version, length range and CRC. Returns the payload length via len. */
static lxr_preset_status_t check(const char magic[4], const uint8_t *sector, uint16_t *len)
{
	if(get32(sector) == 0xFFFFFFFFu)
		return LXR_PRESET_BLANK;
	if(memcmp(sector, magic, 4) != 0 || sector[4] != LXR_PRESET_VERSION)
		return LXR_PRESET_CORRUPT;
	*len = get16(sector + 6);
	if(HEADER_SIZE + (uint32_t)*len + 4u > LXR_PRESET_SECTOR_SIZE)
		return LXR_PRESET_CORRUPT;
	if(get32(sector + HEADER_SIZE + *len) != lxr_crc32(sector, HEADER_SIZE + *len))
		return LXR_PRESET_CORRUPT;
	return LXR_PRESET_OK;
}

void lxr_preset_pack(const char *name, const uint8_t values[LXR_SOUND_PARAM_COUNT], uint8_t sector[LXR_PRESET_SECTOR_SIZE])
{
	memcpy(sector + HEADER_SIZE, values, LXR_SOUND_PARAM_COUNT);
	finish(magicPreset, name ? name : "", LXR_SOUND_PARAM_COUNT, sector);
}

lxr_preset_status_t lxr_preset_unpack(const uint8_t sector[LXR_PRESET_SECTOR_SIZE], char name[LXR_PRESET_NAME_LEN + 1],
                                      uint8_t values[LXR_SOUND_PARAM_COUNT])
{
	uint16_t len;
	const lxr_preset_status_t st = check(magicPreset, sector, &len);
	if(st != LXR_PRESET_OK)
		return st;
	if(len != LXR_SOUND_PARAM_COUNT)
		return LXR_PRESET_CORRUPT;
	memcpy(values, sector + HEADER_SIZE, LXR_SOUND_PARAM_COUNT);
	if(name)
	{
		memcpy(name, sector + 8, LXR_PRESET_NAME_LEN);
		name[LXR_PRESET_NAME_LEN] = '\0';
		for(int i = (int)LXR_PRESET_NAME_LEN - 1; i >= 0 && (name[i] == ' ' || name[i] == '\0'); i--)
			name[i] = '\0';
	}
	return LXR_PRESET_OK;
}

void lxr_preset_factory(uint8_t values[LXR_SOUND_PARAM_COUNT])
{
	/* initKit: 8-byte name "Initkit", then the parameter bytes in id order */
	for(uint16_t id = 0; id < LXR_SOUND_PARAM_COUNT; id++)
	{
		uint8_t v = (8u + id < INIT_KIT_SIZE) ? initKit[8u + id] : 0;
		const lxr_param_info_t *info = lxr_param_find_id(id);
		if(info)
		{
			if(v < info->min) v = info->min;
			if(v > info->max) v = info->max;
		}
		values[id] = v;
	}
}

void lxr_globals_pack(uint8_t last_slot, uint8_t sector[LXR_PRESET_SECTOR_SIZE])
{
	uint8_t *p = sector + HEADER_SIZE;
	p[0] = last_slot;
	uint8_t count = 0;
	uint8_t *pair = p + 2;
	const uint16_t n = lxr_param_count();
	for(uint16_t i = 0; i < n; i++)
	{
		const lxr_param_info_t *info = lxr_param_info(i);
		if(info->id < LXR_SOUND_PARAM_COUNT)
			continue;
		uint8_t v = 0;
		lxr_param_get(info->id, &v);
		put16(pair, info->id);
		pair[2] = v;
		pair += 3;
		count++;
	}
	p[1] = count;
	finish(magicGlobals, NULL, (uint16_t)(2u + 3u * count), sector);
}

lxr_preset_status_t lxr_globals_unpack(const uint8_t sector[LXR_PRESET_SECTOR_SIZE], uint8_t *last_slot)
{
	uint16_t len;
	const lxr_preset_status_t st = check(magicGlobals, sector, &len);
	if(st != LXR_PRESET_OK)
		return st;
	const uint8_t *p = sector + HEADER_SIZE;
	if(len < 2u || len != 2u + 3u * p[1])
		return LXR_PRESET_CORRUPT;
	*last_slot = p[0] < LXR_PRESET_SLOTS ? p[0] : 0;
	for(unsigned i = 0; i < p[1]; i++)
	{
		const uint8_t *pair = p + 2 + 3 * i;
		const uint16_t id = get16(pair);
		if(id >= LXR_SOUND_PARAM_COUNT)
			lxr_param_set(id, pair[2]);   /* rejects unknown ids and out-of-range values */
	}
	return LXR_PRESET_OK;
}

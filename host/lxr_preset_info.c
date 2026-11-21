/*
 * lxr_preset_info.c: checks a preset sector image and lists the parameters
 * that differ from the factory sound.
 *
 *   lxr_preset_info kicks.bin
 *
 * Exit status: 0 for a valid preset, 1 for blank or corrupt, 2 for usage errors.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */
#include <stdio.h>
#include "lxr/engine.h"
#include "lxr/preset.h"

int main(int argc, char **argv)
{
	if(argc != 2)
	{
		fprintf(stderr, "usage: %s <preset.bin>\n", argv[0]);
		return 2;
	}
	static uint8_t sector[LXR_PRESET_SECTOR_SIZE];
	FILE *f = fopen(argv[1], "rb");
	if(!f) { perror(argv[1]); return 2; }
	const size_t n = fread(sector, 1, sizeof sector, f);
	fclose(f);
	if(n != sizeof sector)
	{
		printf("%s: %zu bytes, a preset sector has %u\n", argv[1], n, LXR_PRESET_SECTOR_SIZE);
		return 1;
	}

	char name[LXR_PRESET_NAME_LEN + 1];
	uint8_t v[LXR_SOUND_PARAM_COUNT], factory[LXR_SOUND_PARAM_COUNT];
	const lxr_preset_status_t st = lxr_preset_unpack(sector, name, v);
	if(st == LXR_PRESET_BLANK) { printf("%s: blank (erased) sector\n", argv[1]); return 1; }
	if(st != LXR_PRESET_OK) { printf("%s: CORRUPT (magic, version, length or CRC)\n", argv[1]); return 1; }

	lxr_preset_factory(factory);
	int changed = 0, clamped = 0;
	for(uint16_t id = 0; id < LXR_SOUND_PARAM_COUNT; id++)
	{
		const lxr_param_info_t *p = lxr_param_find_id(id);
		if(!p || v[id] == factory[id]) continue;
		const int out = v[id] < p->min || v[id] > p->max;
		if(changed < 40)
			printf("  %-20s %3u (factory %3u)%s\n", p->name, v[id], factory[id], out ? "  out of range, clamped on load" : "");
		changed++;
		clamped += out;
	}
	printf("%s: OK preset '%s', %d parameter(s) differ from the factory sound%s, %d out of range\n",
	       argv[1], name, changed, changed > 40 ? " (first 40 listed)" : "", clamped);
	return 0;
}

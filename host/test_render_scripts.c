/*
 * test_render_scripts.c: checks that the compiled-in render scripts (the
 * table the Pico's `render` command plays) reproduce the golden WAVs exactly
 * on the host, using the same loop as board/rp2350/offline_render.c.
 *
 *   test_render_scripts <golden dir>
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lxr/engine.h"
#include "render_scripts.h"
#include "Soundengine/MIDI/MidiParser.h"

#define SAMPLE_RATE 44100u

static int16_t *loadGoldenData(const char *path, size_t *samples)
{
	FILE *f = fopen(path, "rb");
	if(!f) { perror(path); return NULL; }
	fseek(f, 0, SEEK_END);
	const long size = ftell(f);
	fseek(f, 44, SEEK_SET);   /* lxr_render writes a plain 44-byte header */
	*samples = (size_t)(size - 44) / 2u;
	int16_t *d = malloc(*samples * sizeof(int16_t));
	if(fread(d, sizeof(int16_t), *samples, f) != *samples) { fclose(f); free(d); return NULL; }
	fclose(f);
	return d;
}

int main(int argc, char **argv)
{
	if(argc < 2) { fprintf(stderr, "usage: %s <golden dir> [script]\n", argv[0]); return 2; }
	int failures = 0;
	static int16_t block[LXR_BLOCK_FRAMES * 2];
	for(unsigned s = 0; s < render_script_count; s++)
	{
		const render_script_t *script = &render_scripts[s];
		if(argc > 2 && strcmp(argv[2], script->name) != 0)
			continue;
		char path[512];
		snprintf(path, sizeof path, "%s/%s.wav", argv[1], script->name);
		size_t samples;
		int16_t *golden = loadGoldenData(path, &samples);
		if(!golden) { failures++; continue; }

		lxr_engine_init(SAMPLE_RATE);
		midiParser_reset();
		uint32_t next = 0;
		size_t pos = 0, diffs = 0;
		for(uint32_t b = 0; b < script->blocks; b++)
		{
			const uint64_t blockStartMs = (uint64_t)b * LXR_BLOCK_FRAMES * 1000u / SAMPLE_RATE;
			while(next < script->count && script->events[next].ms <= blockStartMs)
			{
				const render_event_t *e = &script->events[next++];
				if(e->set_name)
				{
					const lxr_param_info_t *p = lxr_param_find(e->set_name);
					if(p) lxr_midi_param_set(p->id, e->set_value);
				}
				else
					for(unsigned i = 0; i < e->nbytes; i++) midiParser_parseUartData(e->bytes[i]);
			}
			lxr_dispatch_param_events();
			lxr_engine_render(block, LXR_BLOCK_FRAMES);
			for(int i = 0; i < LXR_BLOCK_FRAMES * 2 && pos < samples; i++, pos++)
				diffs += block[i] != golden[pos];
		}
		const int ok = pos == samples && diffs == 0;
		printf("%s %s: %zu samples, %zu differ\n", ok ? "PASS" : "FAIL", script->name, samples, diffs);
		failures += !ok;
		free(golden);
	}
	return failures ? 1 : 0;
}

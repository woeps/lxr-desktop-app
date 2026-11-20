/*
 * lxr_render.c: renders a MIDI script through the MIDI parser and the engine
 * into a 16-bit 44.1 kHz stereo WAV file (requirement R5.5, task 8.1).
 *
 *   lxr_render <script.txt> <seconds> <out.wav>
 *
 * Script lines (times in milliseconds, ascending, '#' starts a comment):
 *   t=<ms> <hex bytes ...>        raw MIDI bytes, e.g.  t=0 99 24 7f
 *   t=<ms> set <param> <value>    Engine API call, e.g. t=0 set midi_note1 36
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
#include <stdint.h>
#include "lxr/engine.h"
#include "Soundengine/MIDI/MidiParser.h"

#define SAMPLE_RATE 44100

typedef struct {
	uint32_t ms;
	int isSet;
	char name[48];
	unsigned value;
	uint8_t bytes[32];
	int nbytes;
} Event;

static Event *events;
static int nevents;

static int loadScript(const char *path)
{
	FILE *f = fopen(path, "r");
	if(!f) { perror(path); return -1; }
	char line[512];
	int lineNo = 0;
	int cap = 0;
	while(fgets(line, sizeof line, f))
	{
		lineNo++;
		char *hash = strchr(line, '#');
		if(hash) *hash = 0;
		char *p = line;
		while(*p == ' ' || *p == '\t') p++;
		if(*p == 0 || *p == '\n' || *p == '\r') continue;

		Event e;
		memset(&e, 0, sizeof e);
		if(sscanf(p, "t=%u", &e.ms) != 1)
		{
			fprintf(stderr, "%s:%d: expected t=<ms>\n", path, lineNo);
			fclose(f);
			return -1;
		}
		p = strchr(p, ' ');
		if(!p) { fprintf(stderr, "%s:%d: empty event\n", path, lineNo); fclose(f); return -1; }
		while(*p == ' ') p++;

		if(strncmp(p, "set ", 4) == 0)
		{
			e.isSet = 1;
			if(sscanf(p + 4, "%47s %u", e.name, &e.value) != 2)
			{
				fprintf(stderr, "%s:%d: usage: set <param> <value>\n", path, lineNo);
				fclose(f);
				return -1;
			}
		}
		else
		{
			char *tok = strtok(p, " \t\r\n");
			while(tok && e.nbytes < 32)
			{
				char *end;
				const unsigned long b = strtoul(tok, &end, 16);
				if(*end || b > 0xff)
				{
					fprintf(stderr, "%s:%d: bad hex byte '%s'\n", path, lineNo, tok);
					fclose(f);
					return -1;
				}
				e.bytes[e.nbytes++] = (uint8_t)b;
				tok = strtok(NULL, " \t\r\n");
			}
		}
		if(nevents > 0 && e.ms < events[nevents - 1].ms)
		{
			fprintf(stderr, "%s:%d: times must not decrease\n", path, lineNo);
			fclose(f);
			return -1;
		}
		if(nevents == cap)
		{
			cap = cap ? cap * 2 : 64;
			events = realloc(events, (size_t)cap * sizeof *events);
		}
		events[nevents++] = e;
	}
	fclose(f);
	return 0;
}

static void put16(FILE *f, uint16_t v) { fputc(v & 0xff, f); fputc(v >> 8, f); }
static void put32(FILE *f, uint32_t v) { put16(f, (uint16_t)(v & 0xffff)); put16(f, (uint16_t)(v >> 16)); }

static void writeWavHeader(FILE *f, uint32_t frames)
{
	const uint32_t dataBytes = frames * 4u;
	fwrite("RIFF", 1, 4, f); put32(f, 36u + dataBytes);
	fwrite("WAVEfmt ", 1, 8, f); put32(f, 16); put16(f, 1); put16(f, 2);
	put32(f, SAMPLE_RATE); put32(f, SAMPLE_RATE * 4u); put16(f, 4); put16(f, 16);
	fwrite("data", 1, 4, f); put32(f, dataBytes);
}

int main(int argc, char **argv)
{
	if(argc != 4)
	{
		fprintf(stderr, "usage: %s <script.txt> <seconds> <out.wav>\n", argv[0]);
		return 2;
	}
	if(loadScript(argv[1]) != 0) return 1;
	const double seconds = atof(argv[2]);
	if(seconds <= 0) { fprintf(stderr, "seconds must be > 0\n"); return 2; }

	const uint32_t blocks = (uint32_t)(seconds * SAMPLE_RATE / LXR_BLOCK_FRAMES + 0.5);
	FILE *out = fopen(argv[3], "wb");
	if(!out) { perror(argv[3]); return 1; }
	writeWavHeader(out, blocks * LXR_BLOCK_FRAMES);

	lxr_engine_init(SAMPLE_RATE);
	midiParser_reset();

	int next = 0;
	static int16_t block[LXR_BLOCK_FRAMES * 2];
	for(uint32_t b = 0; b < blocks; b++)
	{
		const uint64_t blockStartMs = (uint64_t)b * LXR_BLOCK_FRAMES * 1000u / SAMPLE_RATE;
		while(next < nevents && events[next].ms <= blockStartMs)
		{
			const Event *e = &events[next++];
			if(e->isSet)
			{
				const lxr_param_info_t *p = lxr_param_find(e->name);
				if(!p || e->value > 255 || lxr_param_set(p->id, (uint8_t)e->value) != 0)
				{
					fprintf(stderr, "event at %u ms: cannot set %s to %u\n", e->ms, e->name, e->value);
					fclose(out);
					return 1;
				}
			}
			else
			{
				for(int i = 0; i < e->nbytes; i++)
					midiParser_parseUartData(e->bytes[i]);
			}
		}
		lxr_engine_render(block, LXR_BLOCK_FRAMES);
		for(int i = 0; i < LXR_BLOCK_FRAMES * 2; i++)
			put16(out, (uint16_t)block[i]);
	}
	fclose(out);
	if(next < nevents)
		fprintf(stderr, "warning: %d event(s) after the end of the render were not played\n", nevents - next);
	return 0;
}

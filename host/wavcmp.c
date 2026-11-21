/*
 * wavcmp.c: compares two 16-bit PCM WAV files sample by sample (task 8.3).
 *
 *   wavcmp <a.wav> <b.wav> [max_peak_lsb] [max_rms_lsb]
 *
 * Passes (exit 0) when both files have the same format and length, the peak
 * absolute difference is at most max_peak_lsb (default 0) and the RMS
 * difference is at most max_rms_lsb (default 0): bit-exact, design section 10.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

typedef struct {
	uint16_t channels, bits;
	uint32_t rate;
	int16_t *samples;
	size_t count;
} Wav;

static uint32_t rd32(const uint8_t *p) { return p[0] | (p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24); }
static uint16_t rd16(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }

static int load(const char *path, Wav *w)
{
	FILE *f = fopen(path, "rb");
	if(!f) { perror(path); return -1; }
	fseek(f, 0, SEEK_END);
	const long size = ftell(f);
	fseek(f, 0, SEEK_SET);
	uint8_t *buf = malloc((size_t)size);
	if(!buf || fread(buf, 1, (size_t)size, f) != (size_t)size) { fclose(f); fprintf(stderr, "%s: read error\n", path); return -1; }
	fclose(f);
	if(size < 12 || memcmp(buf, "RIFF", 4) || memcmp(buf + 8, "WAVE", 4)) { fprintf(stderr, "%s: not a WAV file\n", path); return -1; }

	memset(w, 0, sizeof *w);
	long pos = 12;
	while(pos + 8 <= size)
	{
		const uint32_t len = rd32(buf + pos + 4);
		if(!memcmp(buf + pos, "fmt ", 4) && len >= 16)
		{
			if(rd16(buf + pos + 8) != 1) { fprintf(stderr, "%s: not PCM\n", path); return -1; }
			w->channels = rd16(buf + pos + 10);
			w->rate = rd32(buf + pos + 12);
			w->bits = rd16(buf + pos + 22);
		}
		else if(!memcmp(buf + pos, "data", 4))
		{
			if(w->bits != 16) { fprintf(stderr, "%s: only 16-bit PCM is supported\n", path); return -1; }
			const uint32_t avail = (uint32_t)(size - pos - 8);
			const uint32_t n = (len < avail ? len : avail) / 2u;
			w->samples = malloc(n * sizeof(int16_t));
			for(uint32_t i = 0; i < n; i++)
				w->samples[i] = (int16_t)rd16(buf + pos + 8 + 2 * i);
			w->count = n;
			free(buf);
			return 0;
		}
		pos += 8 + len + (len & 1);
	}
	fprintf(stderr, "%s: no data chunk\n", path);
	return -1;
}

int main(int argc, char **argv)
{
	if(argc < 3 || argc > 5)
	{
		fprintf(stderr, "usage: %s <a.wav> <b.wav> [max_peak_lsb] [max_rms_lsb]\n", argv[0]);
		return 2;
	}
	const long maxPeak = argc > 3 ? atol(argv[3]) : 0;
	const double maxRms = argc > 4 ? atof(argv[4]) : 0.0;

	Wav a, b;
	if(load(argv[1], &a) || load(argv[2], &b)) return 2;
	if(a.channels != b.channels || a.rate != b.rate)
	{
		printf("FAIL: format differs (%u ch %u Hz vs %u ch %u Hz)\n", a.channels, a.rate, b.channels, b.rate);
		return 1;
	}
	if(a.count != b.count)
	{
		printf("FAIL: length differs (%zu vs %zu samples)\n", a.count, b.count);
		return 1;
	}

	long peak = 0;
	size_t peakAt = 0;
	double sumSq = 0, sumSqA = 0;
	for(size_t i = 0; i < a.count; i++)
	{
		const long d = labs((long)a.samples[i] - (long)b.samples[i]);
		if(d > peak) { peak = d; peakAt = i; }
		sumSq += (double)d * (double)d;
		sumSqA += (double)a.samples[i] * (double)a.samples[i];
	}
	const double rms = a.count ? sqrt(sumSq / (double)a.count) : 0;
	const double rmsA = a.count ? sqrt(sumSqA / (double)a.count) : 0;
	const int ok = peak <= maxPeak && rms <= maxRms;
	printf("%s: peak diff %ld LSB at frame %zu, rms diff %.4f LSB (signal rms %.1f LSB, limits %ld / %.2f)\n",
	       ok ? "PASS" : "FAIL", peak, peakAt / (a.channels ? a.channels : 1), rms, rmsA, maxPeak, maxRms);
	return ok ? 0 : 1;
}

/*
 * test_midi_parser.c: MIDI parser tests against a recording mock of the
 * Engine API (task 6.3).
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */
#include <stdio.h>
#include <string.h>
#include "lxr/engine.h"
#include "Parameters.h"
#include "Soundengine/MIDI/MidiParser.h"

/* ---- mock engine ---- */

uint8_t activeParameters[NUM_PARAMS];

typedef struct { char kind; uint16_t a; uint8_t b, c; } Call;
static Call calls[64];
static int ncalls;
static uint32_t midiErrors;

void lxr_midi_trigger_note(uint8_t voice, uint8_t note, uint8_t velocity)
{
	if(ncalls < 64) calls[ncalls++] = (Call){ 'T', voice, note, velocity };
}

int lxr_midi_param_set(uint16_t id, uint8_t value)
{
	if(ncalls < 64) calls[ncalls++] = (Call){ 'P', id, value, 0 };
	return 0;
}

void lxr_stats_count_midi_error(void) { midiErrors++; }
static uint32_t midiBytes;
void lxr_stats_count_midi_byte(uint8_t byte) { (void)byte; midiBytes++; }

/* ---- helpers ---- */

static int failures;
#define CHECK(cond, ...) \
	do { if(!(cond)) { failures++; printf("FAIL %s:%d: ", __func__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while(0)

static void feed(const uint8_t *bytes, size_t n)
{
	for(size_t i = 0; i < n; i++)
		midiParser_parseUartData(bytes[i]);
}
#define FEED(...) do { const uint8_t b_[] = { __VA_ARGS__ }; feed(b_, sizeof b_); } while(0)

static void reset(void)
{
	ncalls = 0;
	midiErrors = 0;
	memset(activeParameters, 0, sizeof activeParameters);
	/* each voice on its own channel (1..7 stored as 1..7), notes "any" */
	for(int v = 0; v < 6; v++) activeParameters[PAR_MIDI_CHAN_1 + v] = (uint8_t)(v + 1);
	activeParameters[PAR_MIDI_CHAN_7] = 7;
	activeParameters[PAR_MIDI_CHAN_GLOBAL] = 0; /* off */
	activeParameters[PAR_MIDI_FILT_RX] = 15;
	midiParser_reset();
}

/* ---- tests ---- */

static void test_note_on_routes_by_channel(void)
{
	reset();
	FEED(0x92, 60, 100);              /* channel 3 -> voice slot 2 */
	CHECK(ncalls == 1 && calls[0].kind == 'T' && calls[0].a == 2 && calls[0].b == 60 && calls[0].c == 100,
	      "got %d calls, first %c %u %u %u", ncalls, calls[0].kind, calls[0].a, calls[0].b, calls[0].c);
}

static void test_note_off_and_zero_velocity_ignored(void)
{
	reset();
	FEED(0x80, 60, 64, 0x90, 60, 0);
	CHECK(ncalls == 0, "note off produced %d calls", ncalls);
}

static void test_running_status(void)
{
	reset();
	FEED(0x90, 36, 100, 38, 90, 42, 80);
	CHECK(ncalls == 3, "running status: %d calls", ncalls);
	CHECK(ncalls == 3 && calls[1].b == 38 && calls[1].c == 90 && calls[2].b == 42, "running status data wrong");
}

static void test_note_map(void)
{
	reset();
	activeParameters[PAR_MIDI_NOTE1] = 36;     /* voice 0 only answers note 36 and plays its default pitch */
	FEED(0x90, 37, 100);
	CHECK(ncalls == 0, "unmapped note triggered");
	FEED(0x90, 36, 100);
	CHECK(ncalls == 1 && calls[0].a == 0 && calls[0].b == 60, "mapped note: %d calls, note %u", ncalls, calls[0].b);
}

static void test_global_channel(void)
{
	reset();
	activeParameters[PAR_MIDI_CHAN_GLOBAL] = 10;   /* channel 10 */
	activeParameters[PAR_MIDI_NOTE4] = 38;         /* snare */
	activeParameters[PAR_MIDI_NOTE6] = 42;         /* closed hat */
	FEED(0x99, 42, 100);
	CHECK(ncalls == 1 && calls[0].a == 5, "global channel note 42: %d calls, voice %u", ncalls, calls[0].a);
}

static void test_cc_maps_to_parameter(void)
{
	reset();
	FEED(0xB0, PAR_VOL1 + 1, 77);     /* CC number = parameter id + 1 */
	CHECK(ncalls == 1 && calls[0].kind == 'P' && calls[0].a == PAR_VOL1 && calls[0].b == 77,
	      "CC: %d calls, %c id %u value %u", ncalls, calls[0].kind, calls[0].a, calls[0].b);
}

static void test_cc_out_of_range_clamped(void)
{
	reset();
	FEED(0xB0, PAR_OSC_WAVE_DRUM1 + 1, 100);   /* waveform: 0..5 */
	CHECK(ncalls == 1 && calls[0].a == PAR_OSC_WAVE_DRUM1 && calls[0].b == 5, "clamped value %u", calls[0].b);
}

static void test_nrpn(void)
{
	reset();
	/* NRPN coarse (CC 99) 0, fine (CC 98) = id - 128, data entry (CC 6) value */
	const uint8_t idx = (uint8_t)(PAR_FX_DRY_WET - 128);
	FEED(0xB0, 99, 0, 98, idx, 6, 42);
	CHECK(ncalls == 1 && calls[0].kind == 'P' && calls[0].a == PAR_FX_DRY_WET && calls[0].b == 42,
	      "NRPN: %d calls, id %u value %u", ncalls, calls[0].a, calls[0].b);

	/* NRPN cannot reach the module's MIDI settings */
	ncalls = 0;
	FEED(0xB0, 99, (uint8_t)((PAR_MIDI_CHAN_1 - 128) >> 7), 98, (uint8_t)((PAR_MIDI_CHAN_1 - 128) & 0x7f), 6, 5);
	CHECK(ncalls == 0, "NRPN changed a MIDI setting");
}

static void test_realtime_bytes_ignored_inside_message(void)
{
	reset();
	FEED(0x90, 0xF8, 60, 0xFA, 0xFE, 100, 0xFC);
	CHECK(ncalls == 1 && calls[0].b == 60 && calls[0].c == 100, "real-time interleaved: %d calls", ncalls);
	FEED(0xF8, 0xFB, 0xFF);
	CHECK(ncalls == 1, "real-time bytes produced calls");
}

static void test_system_messages_ignored(void)
{
	reset();
	FEED(0xF2, 0x10, 0x20,   /* song position */
	     0xF1, 0x00,         /* MTC quarter frame */
	     0xF3, 0x05,         /* song select */
	     0xC0, 3,            /* program change (selected patterns, now ignored) */
	     0xF0, 0x7D, 1, 2, 3, 0xF7); /* sysex */
	CHECK(ncalls == 0, "system messages produced %d calls", ncalls);
	FEED(0x90, 61, 99);
	CHECK(ncalls == 1, "note after system messages lost");
}

static void test_error_drops_partial_message(void)
{
	reset();
	FEED(0x90, 60);                 /* partial: second data byte lost */
	midiParser_reportError();
	CHECK(midiErrors == 1, "error not counted");
	FEED(100);                      /* stray data byte must not complete the old message */
	CHECK(ncalls == 0, "partial message completed after error");
	FEED(0x91, 62, 90);
	CHECK(ncalls == 1 && calls[0].a == 1 && calls[0].b == 62, "no resync on next status byte");
}

static void test_stray_data_without_status(void)
{
	reset();
	FEED(10, 20, 30);
	CHECK(ncalls == 0, "data bytes without status produced calls");
}

static void test_rx_filter(void)
{
	reset();
	activeParameters[PAR_MIDI_FILT_RX] = 15 & ~MIDI_FILTER_NOTES;
	FEED(0x90, 60, 100);
	CHECK(ncalls == 0, "filtered note passed");
	activeParameters[PAR_MIDI_FILT_RX] = 15 & ~MIDI_FILTER_CC;
	FEED(0xB0, PAR_VOL1 + 1, 77);
	CHECK(ncalls == 0, "filtered CC passed");
}

static void test_rx_word_error_flags(void)
{
	reset();
	midiParser_processRxWord(0x90);
	midiParser_processRxWord(60);
	midiParser_processRxWord(0x0100 | 100);   /* framing error on the velocity byte */
	CHECK(ncalls == 0 && midiErrors == 1, "framing error: %d calls, %u errors", ncalls, midiErrors);
	midiParser_processRxWord(0x0800 | 0x91);  /* overrun */
	CHECK(midiErrors == 2, "overrun not counted");
	midiParser_processRxWord(70);             /* data byte without a valid status is dropped */
	CHECK(ncalls == 0, "data after error used");
	midiParser_processRxWord(0x91);
	midiParser_processRxWord(62);
	midiParser_processRxWord(90);
	CHECK(ncalls == 1 && calls[0].a == 1 && calls[0].b == 62 && calls[0].c == 90, "no resync after error flags");
	CHECK(midiBytes == 8, "byte counter %u, expected 8", midiBytes);
}

uint8_t midiParser_cc2voiceNr(uint8_t cc);   /* MidiParser.c: 1..6 = voice that owns the CC, 0 or 7 = none */

static void test_table_voices_match_parser(void)
{
	/* the console's per-voice lists use the table's voice field, MIDI uses the parser's
	 * channel table: both must agree for every CC parameter */
	for(uint16_t i = 0; i < lxr_param_count(); i++)
	{
		const lxr_param_info_t *p = lxr_param_info(i);
		if(p->id >= 127) continue;
		const uint8_t v = midiParser_cc2voiceNr((uint8_t)(p->id + 1));
		const int parserVoice = (v >= 1 && v <= 6) ? v - 1 : -1;
		CHECK(parserVoice == p->voice, "%s (CC %u): table voice %d, parser voice %d", p->name, p->id + 1, p->voice, parserVoice);
	}
}

int main(void)
{
	test_table_voices_match_parser();
	test_rx_word_error_flags();
	test_note_on_routes_by_channel();
	test_note_off_and_zero_velocity_ignored();
	test_running_status();
	test_note_map();
	test_global_channel();
	test_cc_maps_to_parameter();
	test_cc_out_of_range_clamped();
	test_nrpn();
	test_realtime_bytes_ignored_inside_message();
	test_system_messages_ignored();
	test_error_drops_partial_message();
	test_stray_data_without_status();
	test_rx_filter();

	if(failures) { printf("%d check(s) failed\n", failures); return 1; }
	printf("midi parser ok\n");
	return 0;
}

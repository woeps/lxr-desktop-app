/*
 * test_preset.c: preset and globals sector tests (task 11.4).
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
#include "lxr/preset.h"
#include "Parameters.h"
#include "Preset/InitKit.h"

static int failures;
#define CHECK(cond, ...) \
	do { if(!(cond)) { failures++; printf("FAIL %s:%d: ", __func__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while(0)

static uint8_t sector[LXR_PRESET_SECTOR_SIZE];
static int16_t block[LXR_BLOCK_FRAMES * 2];

static void render(int n) { for(int i = 0; i < n; i++) lxr_engine_render(block, LXR_BLOCK_FRAMES); }

static void test_crc_vector(void)
{
	/* standard check value of CRC-32/ISO-HDLC (zlib), so Python's zlib.crc32 matches */
	CHECK(lxr_crc32((const uint8_t *)"123456789", 9) == 0xCBF43926u, "crc32 check value %08X", lxr_crc32((const uint8_t *)"123456789", 9));
}

static void test_round_trip(void)
{
	uint8_t in[LXR_SOUND_PARAM_COUNT], out[LXR_SOUND_PARAM_COUNT];
	for(int i = 0; i < LXR_SOUND_PARAM_COUNT; i++) in[i] = (uint8_t)(i * 7 + 3);
	lxr_preset_pack("Kick 909", in, sector);
	char name[9];
	memset(out, 0, sizeof out);
	CHECK(lxr_preset_unpack(sector, name, out) == LXR_PRESET_OK, "unpack failed");
	CHECK(memcmp(in, out, sizeof in) == 0, "values differ after round trip");
	CHECK(strcmp(name, "Kick 909") == 0, "name '%s'", name);
	CHECK(sector[LXR_PRESET_SECTOR_SIZE - 1] == 0xFF && sector[16 + LXR_SOUND_PARAM_COUNT + 4] == 0xFF, "sector tail not erased");

	lxr_preset_pack("Hat", in, sector);
	lxr_preset_unpack(sector, name, out);
	CHECK(strcmp(name, "Hat") == 0, "short name '%s'", name);
	lxr_preset_pack("LongerThanEight", in, sector);
	lxr_preset_unpack(sector, name, out);
	CHECK(strcmp(name, "LongerTh") == 0, "long name '%s'", name);
}

static void test_corruption(void)
{
	uint8_t in[LXR_SOUND_PARAM_COUNT], out[LXR_SOUND_PARAM_COUNT];
	memset(in, 42, sizeof in);
	lxr_preset_pack("x", in, sector);
	/* every single flipped bit in header, payload or CRC is detected */
	int missed = 0;
	for(unsigned byte = 0; byte < 16 + LXR_SOUND_PARAM_COUNT + 4; byte++)
	{
		for(int bit = 0; bit < 8; bit++)
		{
			sector[byte] ^= (uint8_t)(1u << bit);
			if(lxr_preset_unpack(sector, NULL, out) == LXR_PRESET_OK) missed++;
			sector[byte] ^= (uint8_t)(1u << bit);
		}
	}
	CHECK(missed == 0, "%d flipped bits not detected", missed);
	CHECK(lxr_preset_unpack(sector, NULL, out) == LXR_PRESET_OK, "intact sector rejected");

	/* a globals sector is not a preset */
	lxr_engine_init(44100);
	lxr_globals_pack(3, sector);
	CHECK(lxr_preset_unpack(sector, NULL, out) == LXR_PRESET_CORRUPT, "globals accepted as preset");

	memset(sector, 0xFF, sizeof sector);
	CHECK(lxr_preset_unpack(sector, NULL, out) == LXR_PRESET_BLANK, "erased sector not blank");
	memset(sector, 0x00, sizeof sector);
	CHECK(lxr_preset_unpack(sector, NULL, out) == LXR_PRESET_CORRUPT, "zero sector not corrupt");
}

static void test_factory_is_initkit(void)
{
	uint8_t f[LXR_SOUND_PARAM_COUNT];
	lxr_preset_factory(f);
	int diff = 0;
	for(uint16_t id = 0; id < LXR_SOUND_PARAM_COUNT; id++)
	{
		const lxr_param_info_t *p = lxr_param_find_id(id);
		const uint8_t kit = (8u + id < INIT_KIT_SIZE) ? initKit[8u + id] : 0;
		if(p && kit >= p->min && kit <= p->max && f[id] != kit) diff++;
		if(p) CHECK(f[id] >= p->min && f[id] <= p->max, "%s factory value %u outside range", p->name, f[id]);
		/* the parameter table defaults are the same factory sound */
		if(p) CHECK(f[id] == p->def, "%s: factory %u, table default %u", p->name, f[id], p->def);
	}
	CHECK(diff == 0, "%d factory values differ from initKit", diff);
}

static void test_blank_loads_factory(void)
{
	/* what the board does at boot: blank slot -> factory sound */
	lxr_engine_init(44100);
	lxr_param_set(PAR_VOL1, 5);
	render(2);
	memset(sector, 0xFF, sizeof sector);
	uint8_t v[LXR_SOUND_PARAM_COUNT];
	if(lxr_preset_unpack(sector, NULL, v) != LXR_PRESET_OK)
		lxr_preset_factory(v);
	lxr_sound_set(v);
	render(LXR_SOUND_PARAM_COUNT / 32 + 2);
	uint8_t vol = 0;
	lxr_param_get(PAR_VOL1, &vol);
	CHECK(vol == lxr_param_find_id(PAR_VOL1)->def, "vol1 %u after factory load", vol);
}

static void test_sixteen_slots_independent(void)
{
	static uint8_t slots[LXR_PRESET_SLOTS][LXR_PRESET_SECTOR_SIZE];
	uint8_t v[LXR_SOUND_PARAM_COUNT];
	for(unsigned s = 0; s < LXR_PRESET_SLOTS; s++)
	{
		memset(v, (int)(s * 5), sizeof v);
		char name[9];
		snprintf(name, sizeof name, "slot%02u", s);
		lxr_preset_pack(name, v, slots[s]);
	}
	for(unsigned s = 0; s < LXR_PRESET_SLOTS; s++)
	{
		char name[9], want[9];
		snprintf(want, sizeof want, "slot%02u", s);
		CHECK(lxr_preset_unpack(slots[s], name, v) == LXR_PRESET_OK && v[0] == s * 5 && v[LXR_SOUND_PARAM_COUNT - 1] == s * 5
		      && strcmp(name, want) == 0, "slot %u wrong", s);
	}
	CHECK(LXR_PRESET_SLOT_OFFSET(4u * 1024u * 1024u, 0) == 0x3EF000u, "slot 0 offset %X", LXR_PRESET_SLOT_OFFSET(4u * 1024u * 1024u, 0));
	CHECK(LXR_PRESET_SLOT_OFFSET(4u * 1024u * 1024u, 16) == LXR_GLOBALS_OFFSET(4u * 1024u * 1024u), "globals after slot 15");
}

static void test_sound_get_set(void)
{
	lxr_engine_init(44100);
	uint8_t a[LXR_SOUND_PARAM_COUNT], b[LXR_SOUND_PARAM_COUNT];
	lxr_sound_get(a);
	a[PAR_VOL1] = 33;
	a[PAR_OSC_WAVE_DRUM1] = 200;            /* out of range: clamped to the last waveform */
	a[PAR_FILTER_TYPE_1] = 2;
	lxr_sound_set(a);
	render(LXR_SOUND_PARAM_COUNT / 32 + 2);
	lxr_sound_get(b);
	CHECK(b[PAR_VOL1] == 33 && b[PAR_FILTER_TYPE_1] == 2, "sound_set values %u %u", b[PAR_VOL1], b[PAR_FILTER_TYPE_1]);
	CHECK(b[PAR_OSC_WAVE_DRUM1] == lxr_param_find_id(PAR_OSC_WAVE_DRUM1)->max, "not clamped: %u", b[PAR_OSC_WAVE_DRUM1]);

	/* a sound load never drops values even when the command queue is full */
	for(int i = 0; i < 400; i++) lxr_param_set(PAR_PAN1, (uint8_t)(i & 0x7f));
	a[PAR_VOL2] = 11;
	lxr_sound_set(a);
	render(LXR_SOUND_PARAM_COUNT / 32 + 4);
	lxr_sound_get(b);
	CHECK(b[PAR_VOL2] == 11, "sound_set lost a value with a full queue");
}

static void test_globals_round_trip(void)
{
	lxr_engine_init(44100);
	lxr_param_set(PAR_MIDI_CHAN_3, 10);
	lxr_param_set(PAR_MIDI_NOTE5, 42);
	lxr_globals_pack(7, sector);
	lxr_engine_init(44100);          /* back to defaults */
	uint8_t v = 0, slot = 99;
	lxr_param_get(PAR_MIDI_CHAN_3, &v);
	CHECK(v == 3, "default not restored (%u)", v);
	CHECK(lxr_globals_unpack(sector, &slot) == LXR_PRESET_OK && slot == 7, "globals unpack slot %u", slot);
	lxr_param_get(PAR_MIDI_CHAN_3, &v);
	CHECK(v == 10, "midi_chan_3 %u", v);
	lxr_param_get(PAR_MIDI_NOTE5, &v);
	CHECK(v == 42, "midi_note5 %u", v);
	memset(sector, 0xFF, sizeof sector);
	CHECK(lxr_globals_unpack(sector, &slot) == LXR_PRESET_BLANK, "blank globals");
}

/* ---- RAM-backed storage ---- */
static uint8_t flashSim[LXR_PRESET_SLOTS + 1][LXR_PRESET_SECTOR_SIZE];
static int flashWrites;
static int simRead(uint8_t i, uint8_t buf[LXR_PRESET_SECTOR_SIZE]) { if(i > LXR_PRESET_SLOTS) return -1; memcpy(buf, flashSim[i], LXR_PRESET_SECTOR_SIZE); return 0; }
static int simWrite(uint8_t i, const uint8_t buf[LXR_PRESET_SECTOR_SIZE]) { if(i > LXR_PRESET_SLOTS) return -1; memcpy(flashSim[i], buf, LXR_PRESET_SECTOR_SIZE); flashWrites++; return 0; }
static const lxr_storage_t simStorage = { simRead, simWrite };

static void test_storage(void)
{
	memset(flashSim, 0xFF, sizeof flashSim);
	lxr_engine_init(44100);
	CHECK(lxr_preset_load(0) == LXR_PRESET_NO_STORAGE, "load without storage");
	lxr_preset_set_storage(&simStorage);

	/* first boot on erased flash: factory sound, no writes */
	CHECK(lxr_preset_boot() == -1 && flashWrites == 0, "erased boot");
	char name[9];
	CHECK(lxr_preset_name(4, name) == LXR_PRESET_BLANK, "slot 4 not blank");
	CHECK(lxr_preset_load(4) == LXR_PRESET_BLANK, "load of a blank slot");
	CHECK(lxr_preset_load(16) == LXR_PRESET_NO_STORAGE, "slot 16 accepted");

	/* save slot 4 with a changed sound and MIDI setting, then save slot 9 */
	lxr_param_set(PAR_VOL1, 21);
	lxr_param_set(PAR_MIDI_CHAN_2, 12);
	render(2);
	CHECK(lxr_preset_save(4, "Snappy") == 0 && flashWrites == 2, "save: %d writes (preset + globals)", flashWrites);
	lxr_param_set(PAR_VOL1, 99);
	render(2);
	CHECK(lxr_preset_save(9, NULL) == 0, "save 9");
	CHECK(lxr_preset_name(9, name) == LXR_PRESET_OK && strcmp(name, "slot09") == 0, "default name '%s'", name);
	CHECK(lxr_preset_name(4, name) == LXR_PRESET_OK && strcmp(name, "Snappy") == 0, "name '%s'", name);
	CHECK(lxr_preset_current() == 9, "current %d", lxr_preset_current());

	/* load slot 4: its sound comes back, the boot slot moves to 4 */
	int w = flashWrites;
	CHECK(lxr_preset_load(4) == LXR_PRESET_OK, "load 4");
	render(LXR_SOUND_PARAM_COUNT / 32 + 2);
	uint8_t v = 0;
	lxr_param_get(PAR_VOL1, &v);
	CHECK(v == 21, "vol1 after load %u", v);
	CHECK(flashWrites == w + 1, "load wrote %d sectors (globals only)", flashWrites - w);
	w = flashWrites;
	lxr_preset_load(4);
	CHECK(flashWrites == w, "reloading the same slot wrote flash");

	/* power cycle: engine back to defaults, boot restores slot 4 and the MIDI channel */
	lxr_engine_init(44100);
	CHECK(lxr_preset_boot() == 4, "boot slot");
	render(LXR_SOUND_PARAM_COUNT / 32 + 2);
	lxr_param_get(PAR_VOL1, &v);
	CHECK(v == 21, "vol1 after boot %u", v);
	lxr_param_get(PAR_MIDI_CHAN_2, &v);
	CHECK(v == 12, "midi_chan_2 after boot %u", v);

	/* a corrupt boot slot falls back to the factory sound, but keeps the MIDI settings */
	flashSim[4][100] ^= 0x10;
	lxr_engine_init(44100);
	CHECK(lxr_preset_boot() == -1, "corrupt slot not detected at boot");
	render(LXR_SOUND_PARAM_COUNT / 32 + 2);
	lxr_param_get(PAR_VOL1, &v);
	CHECK(v == lxr_param_find_id(PAR_VOL1)->def, "factory vol1 %u", v);
	lxr_param_get(PAR_MIDI_CHAN_2, &v);
	CHECK(v == 12, "MIDI settings lost with a corrupt slot (%u)", v);
	CHECK(lxr_preset_name(4, name) == LXR_PRESET_CORRUPT, "corrupt slot name status");

	/* the other slots are untouched */
	CHECK(lxr_preset_load(9) == LXR_PRESET_OK, "slot 9 damaged by slot 4");
	lxr_preset_set_storage(NULL);
}

int main(void)
{
	test_storage();
	test_crc_vector();
	test_round_trip();
	test_corruption();
	test_factory_is_initkit();
	test_blank_loads_factory();
	test_sixteen_slots_independent();
	test_sound_get_set();
	test_globals_round_trip();
	if(failures) { printf("%d check(s) failed\n", failures); return 1; }
	printf("preset ok\n");
	return 0;
}

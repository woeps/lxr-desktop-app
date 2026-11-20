/*
 * test_param_table.c: checks the parameter metadata table (task 4.3, R6.5).
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
#include "Parameters.h"
#include "lxr/param_info.h"

static int failures = 0;

#define CHECK(cond, ...) \
	do { if(!(cond)) { failures++; printf("FAIL: "); printf(__VA_ARGS__); printf("\n"); } } while(0)

/* Sound-range ids that are intentionally not public (docs/removed-params.md). */
static int isExcluded(unsigned id)
{
	if(id == PAR_NONE || id == PAR_NRPN_DATA_ENTRY_COARSE || id == PAR_MORPH_KIT_DEST) return 1;
	if(id == PAR_NRPN_FINE || id == PAR_NRPN_COARSE || id == PAR_BANK_CHANGE) return 1;
	if(id >= PAR_SYNC_LFO1 && id <= PAR_SYNC_LFO6) return 1;
	if(id >= PAR_UNUSED_1 && id <= PAR_UNUSED_7) return 1;
	return 0;
}

int main(void)
{
	const uint16_t count = lxr_param_count();
	CHECK(count > 200, "table has only %u rows", count);

	/* every public sound parameter has exactly one row */
	for(unsigned id = 0; id < END_OF_SOUND_PARAMETERS; id++)
	{
		unsigned rows = 0;
		for(uint16_t i = 0; i < count; i++)
			if(lxr_param_info(i)->id == id) rows++;
		if(isExcluded(id))
			CHECK(rows == 0, "excluded id %u has %u rows", id, rows);
		else
			CHECK(rows == 1, "id %u has %u rows, expected 1", id, rows);
	}

	for(uint16_t i = 0; i < count; i++)
	{
		const lxr_param_info_t *p = lxr_param_info(i);
		CHECK(p != NULL, "row %u is NULL", i);
		if(!p) continue;

		CHECK(p->id < NUM_PARAMS, "%s: id %u out of range", p->name, p->id);
		CHECK(i == 0 || lxr_param_info(i - 1)->id < p->id, "%s: rows not sorted by id", p->name);
		CHECK(p->min <= p->def && p->def <= p->max, "%s: default %u outside %u..%u", p->name, p->def, p->min, p->max);
		CHECK(p->voice >= -1 && p->voice <= 5, "%s: bad voice %d", p->name, p->voice);

		if(p->kind == LXR_KIND_ENUM)
		{
			CHECK(p->enum_names != NULL, "%s: enum without names", p->name);
			for(unsigned v = p->min; p->enum_names && v <= p->max; v++)
				CHECK(p->enum_names[v] && p->enum_names[v][0], "%s: enum name %u empty", p->name, v);
		}
		else
		{
			CHECK(p->enum_names == NULL, "%s: names on a numeric parameter", p->name);
		}

		/* names are unique and findable */
		CHECK(lxr_param_find(p->name) == p, "%s: lxr_param_find does not return its own row", p->name);
		CHECK(lxr_param_find_id(p->id) == p, "%s: lxr_param_find_id fails", p->name);
		for(uint16_t j = (uint16_t)(i + 1); j < count; j++)
			CHECK(strcmp(p->name, lxr_param_info(j)->name) != 0, "duplicate name %s", p->name);
	}

	CHECK(lxr_param_find("no_such_parameter") == NULL, "unknown name found");
	CHECK(lxr_param_find_id(PAR_BPM) == NULL, "sequencer slot PAR_BPM is public");
	CHECK(lxr_param_info(count) == NULL, "index past the end is not NULL");

	/* the module's MIDI settings stay public */
	CHECK(lxr_param_find("midi_note1") != NULL, "midi_note1 missing");
	CHECK(lxr_param_find("midi_chan_global") != NULL, "midi_chan_global missing");

	if(failures) { printf("%d check(s) failed\n", failures); return 1; }
	printf("param table ok: %u rows\n", count);
	return 0;
}

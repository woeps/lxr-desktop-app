/*
 * param_info.h: parameter metadata, the part of the Engine API that describes
 * parameters. Included by lxr/engine.h.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_PARAM_INFO_H_
#define LXR_PARAM_INFO_H_

#include <stdint.h>
#include <stddef.h>

typedef enum {
	LXR_KIND_UINT8 = 0,   /* plain number in min..max */
	LXR_KIND_ENUM = 1,    /* index into enum_names, min..max is 0..count-1 */
} lxr_param_kind_t;

typedef struct {
	uint16_t id;                    /* ParamEnums value, the CC/NRPN number */
	const char *name;               /* unique, lower case, e.g. "filter_freq_1" */
	int8_t voice;                   /* 0..5 for a per-voice parameter, -1 for global/FX/mixer */
	uint8_t kind;                   /* lxr_param_kind_t */
	uint8_t min, max, def;          /* stored (raw) range and the factory default */
	const char *const *enum_names;  /* NULL unless kind == LXR_KIND_ENUM */
} lxr_param_info_t;

/** Number of rows in the parameter table. */
uint16_t lxr_param_count(void);

/** Row by position (0 .. count-1), or NULL. Rows are sorted by id. */
const lxr_param_info_t *lxr_param_info(uint16_t index);

/** Row by parameter id, or NULL if the id is not a public parameter. */
const lxr_param_info_t *lxr_param_find_id(uint16_t id);

/** Row by name, or NULL. */
const lxr_param_info_t *lxr_param_find(const char *name);

#endif /* LXR_PARAM_INFO_H_ */

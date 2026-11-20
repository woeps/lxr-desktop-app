/*
 * engine.h: the Engine API, the only way MIDI, the console and any other UI
 * read or change the sound engine.
 *
 * Threading: two cores. The audio core calls lxr_engine_init once and then
 * lxr_engine_render for every Block. The control core (MIDI parser, console,
 * flash saves) calls every other function. Changes travel from the control core
 * to the audio core through a lock-free queue, so no function here blocks.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_ENGINE_H_
#define LXR_ENGINE_H_

#include <stdint.h>
#include <stddef.h>
#include "lxr/param_info.h"

#define LXR_NUM_VOICES 6

/** Frames in one Block. lxr_engine_render always renders exactly this many. */
#define LXR_BLOCK_FRAMES 64

/** MIDI voice slots (0..6). The hi-hat has a closed and an open slot. */
typedef enum {
	LXR_VOICE_DRUM1 = 0, LXR_VOICE_DRUM2, LXR_VOICE_DRUM3,
	LXR_VOICE_SNARE, LXR_VOICE_CYMBAL, LXR_VOICE_HIHAT_CLOSED, LXR_VOICE_HIHAT_OPEN,
	LXR_NUM_VOICE_SLOTS
} lxr_voice_t;

/** Called on the control core after every accepted parameter change. */
typedef void (*lxr_param_cb)(uint16_t id, uint8_t value, void *user);

/* ---- audio core ------------------------------------------------------------ */

/** Initialises voices, mixer, FX and the parameter store, and loads factory defaults. */
void lxr_engine_init(uint32_t sample_rate);

/** Renders LXR_BLOCK_FRAMES frames of interleaved 16-bit stereo (L, R, L, R, ...).
 *  Applies all queued changes first. frames must equal LXR_BLOCK_FRAMES. */
void lxr_engine_render(int16_t *stereo, uint32_t frames);

/** Records the time one Block took and whether the output ran dry. Audio core. */
void lxr_stats_report_block(uint32_t block_us, int underrun);

/* ---- control core ---------------------------------------------------------- */

/** Triggers a voice slot with its default note. velocity 1..127. */
void lxr_trigger(lxr_voice_t voice, uint8_t velocity);

/** Triggers a voice slot with an explicit MIDI note (pitch). */
void lxr_trigger_note(uint8_t voice, uint8_t note, uint8_t velocity);

/** Sets a parameter by id. Returns 0, or -1 if the id is unknown or value is outside min..max. */
int lxr_param_set(uint16_t id, uint8_t value);

/** Reads the current value. Returns 0, or -1 if the id is unknown. */
int lxr_param_get(uint16_t id, uint8_t *value);

/** Registers the change callback (one). Pass NULL to remove it. */
void lxr_set_param_callback(lxr_param_cb cb, void *user);

typedef struct {
	uint32_t blocks;          /* Blocks rendered */
	uint32_t worst_block_us;  /* longest Block render time so far */
	uint32_t underruns;
	uint32_t midi_errors;     /* framing errors, overruns, resyncs */
	uint32_t queue_drops;     /* commands lost because the queue was full */
} lxr_stats_t;

void lxr_get_stats(lxr_stats_t *out);

/** Counts one MIDI input error (framing error, overrun). Control core. */
void lxr_stats_count_midi_error(void);

#endif /* LXR_ENGINE_H_ */

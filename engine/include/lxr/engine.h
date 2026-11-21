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

/** Records the time one Block took. Audio core. */
void lxr_stats_report_block(uint32_t block_us);

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
	uint32_t blocks;          /* Blocks rendered since boot */
	uint32_t worst_block_us;  /* longest Block render time since the last reset */
	uint32_t avg_block_us;    /* mean Block render time since the last reset */
	uint32_t underruns;       /* Blocks played again because they were not rendered in time, since the last reset */
	uint32_t midi_errors;     /* framing errors, overruns, resyncs */
	uint32_t midi_bytes;      /* MIDI bytes received (including ones with errors) */
	int8_t midi_line;         /* MIDI input line level reported by the board: 1 high (idle), 0 low, -1 unknown */
	uint32_t midi_line_edges; /* falling edges seen on the MIDI input pin (board report), independent of the UART */
	uint32_t queue_drops;     /* commands lost because the queue was full */
	uint32_t sys_clock_khz;   /* reported by the board, 0 if unknown */
	int16_t temp_c_x10;       /* die temperature in 0.1 degC reported by the board, INT16_MIN if unknown */
} lxr_stats_t;

void lxr_get_stats(lxr_stats_t *out);

/** Restarts worst/avg Block time and the underrun count. Takes effect on the next rendered Block. */
void lxr_stats_reset(void);

/** Counts one MIDI input error (framing error, overrun). Control core. */
void lxr_stats_count_midi_error(void);

/** Records one received MIDI byte (for the byte counter and the last-bytes log). Control core. */
void lxr_stats_count_midi_byte(uint8_t byte);

/** Copies up to 16 most recently received MIDI bytes, oldest first. Returns how many. */
int lxr_get_midi_log(uint8_t out[16]);

/** Board report of the MIDI input line: level (1 = idle high, 0 = low) and falling-edge count. Control core. */
void lxr_stats_report_midi_line(int level, uint32_t falling_edges);

/** Counts one audio underrun. Audio core. */
void lxr_stats_report_underrun(void);

/** Board facts for the statistics (clock, die temperature). Control core. */
void lxr_stats_report_board(uint32_t sys_clock_khz, int16_t temp_c_x10);

#endif /* LXR_ENGINE_H_ */

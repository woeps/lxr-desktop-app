/*
 * param_apply.h: applies a parameter value to the voices and FX.
 * Internal to the engine. Runs on the audio core only.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef PARAM_APPLY_H_
#define PARAM_APPLY_H_

#include "Soundengine/platform.h"
#include "Soundengine/MIDI/MidiMessages.h"

/**
 * Applies one parameter value, given in the old CC message form
 * (status MIDI_CC with data1 = id + 1, or CC_2 / MIDI_CC2 with data1 = id - 128).
 * updateOriginalValue: remember the value as the one automation returns to.
 * isFloatModulator: v (0..1) replaces data2, used by LFOs and velocity modulation.
 */
void engine_applyCc(MidiMsg msg, uint8_t updateOriginalValue, uint8_t isFloatModulator, float v);

/** The last value set for every CC / NRPN number, so automation can return to it. */
extern uint8_t engine_originalCcValues[0xff];

/** Detune factor (about -50 to +50 cent) for a 0..127 fine-tune value. */
float engine_calcDetune(uint8_t value);

/** 1 if the voice (0..6) is muted by its CC2_MUTE parameter. */
uint8_t engine_isVoiceMuted(uint8_t voice);

#endif /* PARAM_APPLY_H_ */

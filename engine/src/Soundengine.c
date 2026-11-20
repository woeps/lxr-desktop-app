/*
 * Soundengine.c: engine start-up and block rendering.
 *
 *  Created on: Mar 24, 2020
 *      Author: julian
 *
 * Copyright (C) 2012-2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */
#include "Soundengine/Soundengine.h"
#include <string.h>

void soundengine_init()
{
	initRng();
	mixer_init();
	parameterArray_init();

	for(int i=0;i<6;i++)
	{
		modNode_init(&velocityModulators[i]);
	}

	memset(midi_MidiChannels,0,8);

	initDrumVoice();
	Snare_init();
	HiHat_init();
	Cymbal_init();
}

void soundengine_renderBlock(int16_t* stereoOut)
{
	/* The mixer can feed a second output pair. This module has only one
	 * stereo output (the first pair), so the second pair goes to a scratch buffer. */
	static int16_t unusedSecondPair[OUTPUT_DMA_SIZE*2];

	mixer_calcNextSampleBlock(stereoOut, unusedSecondPair);
}

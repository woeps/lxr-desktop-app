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

	initDrumVoice();
	Snare_init();
	HiHat_init();
	Cymbal_init();
}

void soundengine_renderBlock(int16_t* stereoOut)
{
	/* The mixer has two output pairs and writes DAC 1 ("St1", the default
	 * routing) into its second buffer. The module's single stereo output is
	 * DAC 1. DAC 2 goes to a scratch buffer; mixer_checkOutJackAvailable
	 * reroutes anything sent to DAC 2 onto DAC 1. */
	static int16_t unusedDac2[OUTPUT_DMA_SIZE*2];

	mixer_calcNextSampleBlock(unusedDac2, stereoOut);
}

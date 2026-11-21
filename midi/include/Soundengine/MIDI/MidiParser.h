/*
 * MidiParser.h
 *
 *  Created on: 13.04.2012
 *
 * Copyright (C) 2012-2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */


#ifndef MIDIPARSER_H_
#define MIDIPARSER_H_

#include "Soundengine/platform.h"
#include "Soundengine/globals.h"
#include "Soundengine/MIDI/MidiMessages.h"



void midiParser_parseUartData(unsigned char data);
void midiParser_parseMidiMessage(volatile MidiMsg msg);

/** Puts the parser into its power-on state (no running status, no NRPN number). */
void midiParser_reset(void);

/** Call on a UART framing error or overrun: drops the partial message, waits for
 *  the next status byte, and counts the error in the engine statistics. */
void midiParser_reportError(void);

/** UART data register error flags (PL011 layout: bits 8..11 = FE, PE, BE, OE). */
#define MIDI_RX_ERROR_FLAGS 0x0F00u

/** Handles one UART data register value: a byte with an error flag triggers
 *  midiParser_reportError() and is discarded, otherwise the byte is parsed. */
void midiParser_processRxWord(uint16_t uartDr);
#if 0
void midiDebugSend(uint8_t b1, uint8_t b2);
#endif

enum TxRxFilterValues
{
	MIDI_FILTER_NOTES = 0x01,
	MIDI_FILTER_SYSTEM = 0x02,
	MIDI_FILTER_CC = 0x04,
	MIDI_FILTER_PROG_C = 0x08,
};


#endif /* MIDIPARSER_H_ */

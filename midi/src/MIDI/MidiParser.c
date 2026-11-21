/*
 * MidiParser.c
 *
 *  Created on: 02.04.2012
 *
 * Copyright (C) 2012-2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */


#include "Soundengine/MIDI/MidiParser.h"
#include "Soundengine/MIDI/MidiNoteNumbers.h"
#include "Soundengine/DSPAudio/DrumVoice.h"
#include "Soundengine/DSPAudio/Snare.h"
#include "Soundengine/config.h"
#include "Soundengine/DSPAudio/HiHat.h"
#include "Soundengine/DSPAudio/CymbalVoice.h"
#include "Soundengine/DSPAudio/mixer.h"
#include "Soundengine/MIDI/valueShaper.h"
#include "Soundengine/DSPAudio/modulationNode.h"
#include "Soundengine/FxBus.h"

#include "Soundengine/MIDI/MidiMessages.h"
#include "lxr/engine.h"
#include <string.h>
#include "Parameters.h"

static uint16_t midiParser_activeNrpnNumber = 0;

/** Receive filter bitmap (MIDI_FILTER_*) and per-voice channels live in the engine's parameter store. */
#define MIDI_RX_FILTER (activeParameters[PAR_MIDI_FILT_RX])

/** MIDI channel (0..15) of voice slot 0..6, or of the global channel for index 7.
 *  Returns 0xff (matches nothing) when the global channel is off. */
static uint8_t midiParser_channelOf(uint8_t voice)
{
	uint8_t stored; /* 1..16, or 0 = off for the global channel */
	if(voice < 6) stored = activeParameters[PAR_MIDI_CHAN_1 + voice];
	else if(voice == 6) stored = activeParameters[PAR_MIDI_CHAN_7];
	else stored = activeParameters[PAR_MIDI_CHAN_GLOBAL];
	return stored ? (uint8_t)(stored - 1) : 0xff;
}

enum State
{
	MIDI_STATUS,  		// waiting for status byte
	MIDI_DATA1,  		// waiting for data byte1
	MIDI_DATA2,  		// waiting for data byte2
	SYSEX_DATA,  		// read sysex data byte
	IGNORE				// set when unknown status byte received, stays in ignore mode until next known status byte
  };

//-----------------------------------------------------------
// vars
//-----------------------------------------------------------

// note overrides for each voice
//uint8_t midi_NoteOverride[7];
//uint8_t midi_mode; // not used anymore
MidiMsg midiMsg_tmp;				// buffer message where the incoming data is stored
// these two are used only when building up a midi message
//static uint8_t msgLength;					// number of following data bytes expected for current status
static uint8_t parserState = IGNORE;	// state of the parser state machine. Set to what it's expecting next
										// we set it to ignore initially so that any random data we get before
										// a valid msg header is ignored

//-----------------------------------------------------------
/** Sends a parameter change to the engine. Out-of-range values are clamped (MIDI cannot refuse). */
static void midiParser_setParam(uint16_t id, uint8_t value)
{
	const lxr_param_info_t *info = lxr_param_find_id(id);
	/* MIDI reaches sound parameters only, as in the old firmware. The module's
	 * own MIDI settings (channels, note map, filters) are not changed by MIDI. */
	if(!info || id >= END_OF_SOUND_PARAMETERS)
		return;
	if(value > info->max)
		value = info->max;
	lxr_param_set(id, value);
}
//-----------------------------------------------------------
/** Handles a control change. CCs 98/99 and 6 build the NRPN number and value, all others map to a parameter. */
static void midiParser_ccHandler(MidiMsg msg)
{
	switch(msg.data1)
	{
		case NRPN_DATA_ENTRY_COARSE:
			midiParser_setParam((uint16_t)(128 + midiParser_activeNrpnNumber), msg.data2);
			break;

		case NRPN_FINE:
			midiParser_activeNrpnNumber &= ~(0x7f);	//clear lower 7 bit
			midiParser_activeNrpnNumber |= (msg.data2&0x7f);
			break;

		case NRPN_COARSE:
			midiParser_activeNrpnNumber &= 0x7f;	//clear upper 7 bit
			midiParser_activeNrpnNumber |= ((uint16_t)msg.data2<<7);
			break;

		default:
			midiParser_setParam((uint16_t)(msg.data1 - 1), msg.data2);
			break;
	}
}
//------------------------------------------------------
// this fn assumes a valid voice is sent
static void midiParser_noteOn(uint8_t voice, uint8_t note, uint8_t vel)
{
	// check the note mapping for the voice. If it's "any" (0), trigger the received note.
	// if it's some other note, trigger the drum voice only if it matches, and in this case
	// trigger the default note
	if(activeParameters[PAR_MIDI_NOTE1 + voice] != 0) {
		if(note==activeParameters[PAR_MIDI_NOTE1 + voice])
			note=OSC_DEFAULT_NOTE; // match found. Play default note
		else
			return; // note does not match. Do nothing
	}

	lxr_trigger_note(voice, note, vel);
}
//------------------------------------------------------
//static void midiParser_noteOff(uint8_t voice, uint8_t note, uint8_t vel)
//{
	// in case we ever need it
//}


//check if midi channel is selected for a voice or as global channel
uint8_t midiParser_isValidChannel(uint8_t chan)
{
	for(int i=0;i<8;i++)
	{
		if(chan == midiParser_channelOf(i)) return 1;
	}

	return 0;
}

uint8_t midiParser_cc2voiceNr(uint8_t cc)
{
	switch(cc)
	{

	//No voice
	default:
		case 0:
		case 1:
		case 6:
		case 98:
		case 99:
			return 0;

	//voice 1
		case 2:
		case 9:
		case 10:
		case 21:
		case 38:
		case 44:
		case 50:
		case 51:
		case 63:
		case 71:
		case 75:
		case 79:
		case 83:
		case 84:
		case 89:
		case 95:
		case 103:
		case 109:
		case 116:
		case 122:
			return 1;

	//voice 2
		case 3:
		case 11:
		case 12:
		case 22:
		case 39:
		case 45:
		case 52:
		case 53:
		case 64:
		case 72:
		case 76:
		case 80:
		case 85:
		case 86:
		case 90:
		case 96:
		case 104:
		case 110:
		case 117:
		case 123:
			return 2;

	//voice 3
		case 4:
		case 13:
		case 14:
		case 23:
		case 40:
		case 46:
		case 54:
		case 55:
		case 65:
		case 73:
		case 77:
		case 81:
		case 87:
		case 88:
		case 91:
		case 97:
		case 105:
		case 111:
		case 118:
		case 124:
			return 3;

	//voice 4
		case 5:
		case 15:
		case 16:
		case 28:
		case 29:
		case 41:
		case 47:
		case 56:
		case 57:
		case 66:
		case 69:
		case 74:
		case 78:
		case 82:
		case 92:
		case 100:
		case 106:
		case 112:
		case 119:
		case 125:
			return 4;

	//voice 5
		case 7:
		case 17:
		case 18:
		case 24:
		case 25:
		case 30:
		case 31:
		case 32:
		case 33:
		case 42:
		case 48:
		case 58:
		case 59:
		case 67:
		case 70:
		case 93:
		case 101:
		case 107:
		case 113:
		case 120:
		case 126:
			return 5;

	//voice 6
		case 8:
		case 19:
		case 20:
		case 26:
		case 27:
		case 34:
		case 35:
		case 36:
		case 37:
		case 43:
		case 49:
		case 60:
		case 61:
		case 62:
		case 68:
		case 94:
		case 102:
		case 108:
		case 114:
		case 121:
		case 127:
			return 6;

	//all voices
		case 115:
			return 7;

	}
}

//-----------------------------------------------------------
/** Parse incoming midi messages and invoke corresponding action
 */
void midiParser_parseMidiMessage(MidiMsg msg)
{
	if(msg.bits.sysxbyte)
		return; // no further action needed. we don't interpret sysex data

	// FILT filter messages here. Filter inline below to be more optimal
	// we are interested in the low nibble since we are Rx here


	if((msg.status & 0xF0) == 0xF0)
	{
		// System messages (clock, start, stop, continue, song position, MTC):
		// the module has no sequencer or tempo, so they are consumed and ignored.
	}
  else
  { // channel specific message
		const uint8_t msgonly = msg.status & 0xF0;
		const uint8_t chanonly= msg.status & 0x0F;

    msg.lastNonSysStatus = msg.status;

		if((msgonly & 0xE0) == 0x80) {
			// note on or note off message (one of these two only)
			if((MIDI_RX_FILTER & MIDI_FILTER_NOTES) && msgonly==NOTE_ON && msg.data2) {
				int8_t v;
				// a note on the global channel triggers every voice whose note mapping matches
				if(midiParser_channelOf(7)==chanonly) {
					for(v=0;v<7;v++) {
						if(activeParameters[PAR_MIDI_NOTE1 + v] == msg.data1)
							midiParser_noteOn(v, msg.data1, msg.data2);
					}
				}

				// check each voice to see if it cares about this message
				for(v=0;v<7;v++) {
					if(midiParser_channelOf(v)==chanonly) {
						midiParser_noteOn(v, msg.data1, msg.data2);
					}
				}
			} // check midi filter
			// note off messages need no action: the drum voices decay on their own

		} else if(msgonly==MIDI_CC){


			/* 1..6 = voice that owns the CC (old firmware indexed the channel table with this 1-based number, off by one), 0 or 7 = any */
			uint8_t voiceNr = midiParser_cc2voiceNr(msg.data1);

			if(voiceNr==0 || voiceNr >= 7) //any set midi channel
			{
				if((MIDI_RX_FILTER & MIDI_FILTER_CC) && (midiParser_isValidChannel(chanonly) ))
				{
					//handle midi data
					midiParser_ccHandler(msg);
				}
			}
			else
			{

				// respond to CC message. This responds only when global channel or voice channel matches the cc message's channel
				if((MIDI_RX_FILTER & MIDI_FILTER_CC) && ((chanonly == midiParser_channelOf((uint8_t)(voiceNr - 1))) || (chanonly == midiParser_channelOf(7)) )) {
					//handle midi data
					midiParser_ccHandler(msg);
				}
			}
		} else {
			// anything else
			// TODO MIDI_PITCH_WHEEL ?
		}
	} // channel specific vs non channel specific

}

//-----------------------------------------------------------

void midiParser_handleStatusByte(unsigned char data)
{
	// we received a channel voice/mode byte. set the status as appropriate
	switch(data&0xF0)
  {
    // 2 databyte messages
    case NOTE_OFF:
    case NOTE_ON:
    case MIDI_CC:
    case MIDI_PITCH_WHEEL:
    case MIDI_AT:
      midiMsg_tmp.status = data;	// store the new status byte
      parserState = MIDI_DATA1;	//status received, next should be data byte 1
      midiMsg_tmp.bits.length = 2;// status is followed by 2 data bytes
      break;

    // 1 databyte messages
    case PROG_CHANGE:
    case CHANNEL_PRESSURE:
      midiMsg_tmp.status = data;	// store the new status byte
      parserState = MIDI_DATA1;	//status received, next should be data byte 1
      midiMsg_tmp.bits.length = 1;// status is followed by 1 data bytes
      break;

    // messages we don't care about right now, and don't know how to handle or passthru (Are there any?).
    default:
      parserState = IGNORE;	// throw away any data bytes until next message
      midiMsg_tmp.bits.length = 0;
      break;
	}

  midiMsg_tmp.lastNonSysStatus = data;
}
//-----------------------------------------------------------
void midiParser_reset(void)
{
	memset(&midiMsg_tmp, 0, sizeof(midiMsg_tmp));
	parserState = IGNORE;
	midiParser_activeNrpnNumber = 0;
}
//-----------------------------------------------------------
void midiParser_reportError(void)
{
	/* drop the partial message and wait for the next status byte (no running status) */
	parserState = IGNORE;
	midiMsg_tmp.bits.length = 0;
	midiMsg_tmp.lastNonSysStatus = 0;
	lxr_stats_count_midi_error();
}
//-----------------------------------------------------------
void midiParser_processRxWord(uint16_t uartDr)
{
	if(uartDr & MIDI_RX_ERROR_FLAGS)
		midiParser_reportError();
	else
		midiParser_parseUartData((unsigned char)(uartDr & 0xff));
}
//-----------------------------------------------------------
// This will build up the midi message and hand it off to
// parseMidiMessage when it's complete
void midiParser_parseUartData(unsigned char data)
{
  uint8_t parseMsg = 0;

  /* System real-time bytes (clock, start, continue, stop, active sensing, reset)
   * may arrive between any two bytes of another message. They carry no data and
   * the module has no tempo, so they are dropped without touching the parser state. */
  if(data >= 0xF8)
    return;

  // if (data == 0xF8)
  // {
  //   return;
  // }

	if(data & 0x80)
  {
  /*  High bit is set -  its either a status or a system message.
      regardless of current state, we blindly start a new message without questioning it */
		midiMsg_tmp.bits.sysxbyte = 0;

		if((data&0xf0) == 0xF0) /* System message */
    {
			midiMsg_tmp.status = data;
			switch(data)
      {
        case MIDI_CLOCK:
          parseMsg = 1;
          break;  
			  case SYSEX_START: /*  Get into sysex receive mode. any more bytes received until this status changes are considered
							                to be sysex data. we still need to parse this sysex start, in case we are routing it */
          parserState = SYSEX_DATA;
          midiMsg_tmp.bits.length = 0;
          parseMsg = 1; /* we will still parse it in case we are doing a passthru */
          break;
        case SYSEX_END:	  /* Get out of sysex mode */
          if(parserState == SYSEX_DATA)
          {
            parserState = MIDI_STATUS;
            midiMsg_tmp.bits.length = 0;
            parseMsg = 1; // We will still parse it in case we are doing a passthru
            break;
          }
          else
          {
            // spurious sysex end msg received. ignore it
          }
          break;
        /* 1 byte payload messages */
        case MIDI_SONG_SEL:		  // passthru only
          parseMsg = 1;
          break; 
        case MIDI_MTC_QFRAME: 	// mtc chunk
          parserState = MIDI_DATA1; 	  // we expect the nugget of mtc frame info
          midiMsg_tmp.bits.length = 1;  // we expect 1 data byte
          break;
        case MIDI_SONG_POSITION_POINTER:
          parserState = MIDI_DATA1; 	// we expect 14-bit value for song position
          midiMsg_tmp.bits.length = 2;// we expect 1 data byte
          break;
        default: /* 0 byte payload messages (we will assume that any system message
                    other than those above has 0 byte payload) */
          // midiMsg_tmp.bits.length = 0;
          parseMsg = 1;
          break;
			}
		}
    else
    { /* Status byte (channel specific message containing a channel number) */
			midiParser_handleStatusByte(data);
		}
	}
  else
  { /* High bit is not set - it's a data byte */
		switch(parserState)
    {
      case MIDI_STATUS: /* We are expecting status msg, but got data, so running status may be in effect */
        midiMsg_tmp.status = midiMsg_tmp.lastNonSysStatus;
        if(midiMsg_tmp.bits.length)
        {
          midiMsg_tmp.data1 = data;
          if(midiMsg_tmp.bits.length == 2)
          {
            parserState = MIDI_DATA2;
          }
          else
          {
            midiMsg_tmp.data2 = 0;
            parseMsg = 1;
            break;
          }
        }
        else
        {
          break; // last msg had 0 payload, so wtf is this? just ignore it
        }
        break;
      case MIDI_DATA1:
        midiMsg_tmp.data1 = data;
        if(midiMsg_tmp.bits.length == 2)
        {
          parserState = MIDI_DATA2; /* We need another byte before we can do anything meaningful */
        }
        else /* It must be 1 */
        {
          parseMsg = 1;
          break;
        }
        break;
      case MIDI_DATA2:
        midiMsg_tmp.data2 = data;
        parseMsg = 1; /* Message complete */
        break;
      case SYSEX_DATA: /* We are in sysex mode */
        midiMsg_tmp.bits.sysxbyte = 1;
        midiMsg_tmp.status = data; // Status will contain the sysex byte
        midiMsg_tmp.bits.length = 0;
        parseMsg = 1;
        break;
      default: /* We are expecting no data byte, but we got one */
			  break;
		}
	}

  if (parseMsg == 1)
  {
    /* We get here if we have proudly received a message that we want to do something with */
    if(parserState != SYSEX_DATA) // we are still in sysex receive mode
      parserState = MIDI_STATUS;  // next byte should be a new message, or we don't care about it
    midiMsg_tmp.bits.source = midiSourceMIDI;
    midiParser_parseMidiMessage(midiMsg_tmp);
    parseMsg = 0;
  }

	return;
}

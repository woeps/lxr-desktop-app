# Parameters removed or ignored with the sequencer (task 3.3)

Parameter IDs below `END_OF_SOUND_PARAMETERS` (247) are the CC/NRPN IDs and **keep their values** (requirements R2.5 and R4.5). IDs from `END_OF_SOUND_PARAMETERS` upward were never CC IDs. They were slots in the old front panel's edit buffer (`activeParameters`).

## Sound-range IDs that stay in the enum but have no effect

| ID name | Why |
|---|---|
| `PAR_SYNC_LFO1` to `PAR_SYNC_LFO6` | LFO tempo sync. There is no tempo, so the LFO always runs at its free frequency (`lfo_calcPhaseInc` ignores the sync value). |
| `PAR_MORPH_KIT_DEST` | Kit morphing belonged to the SD-card preset manager, which is replaced by the flash presets (task 11). |

The parameter table of task 4 leaves these rows out, so they do not appear in the Engine API or the console.

## Slots at or above `END_OF_SOUND_PARAMETERS`

Not part of the Engine API. The sequencer, pattern, front-panel and kit-morph slots below are unused and the table of task 4 does not list them:

`PAR_ROLL`, `PAR_MORPH`, `PAR_ACTIVE_STEP`, `PAR_STEP_VOLUME`, `PAR_STEP_PROB`, `PAR_STEP_NOTE`, `PAR_EUKLID_LENGTH`, `PAR_EUKLID_STEPS`, `PAR_EUKLID_ROTATION`, `PAR_AUTOM_TRACK`, `PAR_P1_DEST`, `PAR_P2_DEST`, `PAR_P1_VAL`, `PAR_P2_VAL`, `PAR_SHUFFLE`, `PAR_PATTERN_NEXT`, `PAR_TRACK_LENGTH`, `PAR_TRACK_ROTATION`, `PAR_STEP_FLAM`, `PAR_STEP_SHIFT`, `PAR_BPM`, `PAR_FETCH`, `PAR_FOLLOW`, `PAR_QUANTISATION`, `PAR_SCREENSAVER_ON_OFF`, `PAR_PRESCALER_CLOCK_IN`, `PAR_PRESCALER_CLOCK_OUT1`, `PAR_PRESCALER_CLOCK_OUT2`, `PAR_TRIG_GATE_MODE`, `PAR_BAR_RESET_MODE`, `PAR_PATTERN_MODE`.

## Slots that stay

`PAR_MIDI_CHAN_1` to `PAR_MIDI_CHAN_7`, `PAR_MIDI_CHAN_GLOBAL`, `PAR_MIDI_NOTE1` to `PAR_MIDI_NOTE7`, `PAR_MIDI_FILT_TX`, `PAR_MIDI_FILT_RX`. They are the module's MIDI settings (channel and note mapping per voice).

## Behaviour changes in the MIDI parser

- Clock, start, stop, continue, song position and MTC messages are consumed and ignored.
- Program change is ignored (it selected sequencer patterns).
- A note on the global channel (`midi_MidiChannels[7]`) now triggers every voice whose note mapping (`PAR_MIDI_NOTEx`) equals that note. It used to play the voice active on the front panel, which the module does not have.
- Note off messages need no action. The drum voices decay on their own.
- MIDI thru, routing and the USB output are gone.

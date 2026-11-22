# Requirements: Web UI for sound design and preset management

## Introduction

The LXR sound module (RP2350 firmware in `/home/chris/Projects/lxr-desktop-app`) has no front panel.
Sounds are edited today by sending MIDI CC and NRPN messages or by typing console commands over USB
serial. This feature adds an interactive web page for sound design: the user shapes a sound with
controls, hears it on the module, keeps a library of sounds, and transfers any of them to the module
over MIDI.

**Constraints that shape every requirement:**

- **The module only receives serial MIDI** on its 3.5 mm TRS (DIN) input. The computer reaches it
  through a USB MIDI interface wired to that input, using the browser's Web MIDI API (no SysEx
  permission is needed).
- **The firmware changes by one small addition only** (R11): a reserved NRPN that stores the current
  sound into the boot slot. Nothing else in the firmware changes.
- **The link is one-way.** The module has no MIDI output, so the page cannot read parameter values,
  the slot list or slot contents. The page is the source of truth for the sound it is editing.
- **Presets travel over MIDI only.** A preset is transferred to the module by sending all of its
  parameters as CC and NRPN. The firmware ignores program change and system exclusive messages, and
  `preset load|save` exists only on the USB serial console, which this feature does not use. A
  transferred preset is the module's live sound until it is replaced or the module loses power. To
  keep it over a power cycle, the page sends the store command of R11, which writes the live sound
  into the boot slot. Other slots cannot be written, read or listed. Presets are kept in a library on
  the computer.

The page is a SolidJS application that runs entirely in the browser and needs no server, no
installation and no account.

## Glossary

- **Module**: the RP2350 board running the LXR firmware with the R11 addition.
- **MIDI interface**: the user's USB MIDI interface; its DIN output is wired to the module's TRS
  input.
- **Parameter**: one named sound or MIDI setting from the firmware's parameter table (for example
  `filter_freq_1`, 0 to 127). A parameter has a voice (or is global), a range, a default, and
  possibly named values. Parameters 0 to 126 are addressed by CC 1 to 127; parameters 128 and above
  are addressed by NRPN n = parameter - 128 (the "MIDI implementation" table in `README.md`).
- **Voice**: drum 1, drum 2, drum 3, snare, cymbal, hi-hat (closed and open trigger). Global
  parameters (FX bus, MIDI channels and trigger notes) belong to no voice.
- **Sound**: a name (up to 8 characters) and one value for every sound parameter.
- **Library**: the sounds the user keeps in the browser and in files on the computer.
- **Slot**: one of the module's 16 flash preset locations, 0 to 15.
- **Boot slot**: the slot the module loads at power-up; it is the slot last loaded or saved, and is
  recorded in the module's globals sector.
- **Store command**: the reserved NRPN of R11 that writes the live sound into the boot slot.

## Requirements

### R1. Connect to the MIDI interface

**User story:** As a sound designer, I want to pick my MIDI interface in the page, so that the page
can play and tweak the module.

Acceptance criteria:
1. WHEN the user presses Connect, THE page SHALL request Web MIDI access, list the available MIDI
   outputs, remember the choice in the browser, and let the user select another output.
2. WHILE no output is selected, THE page SHALL still allow editing, the library and file export, and
   SHALL show that the sound is not being sent.
3. WHEN the selected output disappears, THE page SHALL show "Disconnected", keep all edits, and
   reconnect when the same output returns.
4. THE page SHALL show clearly that the link is one-way: it cannot detect the module, its firmware
   version, or whether a message arrived. It SHALL provide a Test button that sends a note so the
   user can check the chain by ear.
5. IF the browser does not support Web MIDI or the user denies access, THEN THE page SHALL say so,
   name the supported browsers (Chrome, Edge, Opera), and
   SHALL still allow editing and file work.
6. IF the page is opened from a context that Web MIDI refuses (not HTTPS and not localhost), THEN
   THE page SHALL show that reason.
7. THE page SHALL work when opened from `localhost` and from a static HTTPS host, with no backend.

### R2. Module MIDI setup

**User story:** As a sound designer, I want to tell the page which channels the module listens on, so
that edits reach the right voice.

Acceptance criteria:
1. THE page SHALL provide channel settings for each voice (default as in the firmware: drum 1 to
   drum 3 on channels 1 to 3, snare 4, cymbal 5, hi-hat 6, which also carries open hi-hat) and for the
   global channel, matching `midi_chan_1` to `midi_chan_7` and `midi_chan_global`, and SHALL send
   each voice's CCs on that voice's channel and shared parameters and NRPNs on the global channel if
   set, otherwise on drum 1's channel.
2. THE page SHALL also hold each voice's fixed trigger note (`midi_note1` to `midi_note7`, 0 = any
   note) for auditioning (R4).
3. THE page SHALL state that these settings describe the module and are not sent to it: the firmware
   does not accept its MIDI settings over MIDI, so they are changed with the console. THE page SHALL
   keep them in the browser, separate from sounds, and SHALL warn that a mismatch makes the module
   ignore the page.

### R3. Edit the sound with controls

**User story:** As a sound designer, I want sliders, switches and menus for every parameter, so that
I can shape a sound by ear.

Acceptance criteria:
1. THE page SHALL group parameters by voice and by function within a voice (oscillator, pitch, FM and
   modulators, filter, amp envelope, pitch envelope, and so on), plus Global/FX and MIDI sections,
   using the voice and description of each parameter in the firmware's parameter table.
2. THE page SHALL show a slider with its numeric value for numeric parameters, and a menu or
   segmented control with value names for list parameters (waveform, filter type, FX type, and so
   on), within each parameter's range.
3. WHEN the user changes a control and an output is selected, THE page SHALL send the value as CC
   (parameters 0 to 126) or as NRPN (parameter 128 and above: CC 99, CC 98, CC 6) on the right
   channel, so the change is audible immediately.
4. WHILE the user drags a slider, THE page SHALL send at most one message per 10 ms per parameter and
   SHALL always send the final value on release, so the 31250 baud DIN link is not saturated. THE
   page SHALL pace its output so messages arrive in order, and SHALL show while messages are
   still waiting to be sent.
5. WHEN the user double-clicks a control or presses its Reset button, THE page SHALL set it to its
   default from the parameter table.
6. THE page SHALL mark each parameter that differs from the sound as it was last loaded or saved,
   and show a per-voice and global "modified" indicator.
7. THE page SHALL provide per-voice Copy and Paste between drum 1, 2 and 3 (the same parameter
   layout), without changing the MIDI channel and trigger note settings.
8. THE page SHALL provide a Send all button that sends every parameter of the sound to the module.
9. WHEN a sound is loaded in the page (R6, R8), THE page SHALL send it to the module in full when an
   output is selected, with a progress indicator, and SHALL block triggering until it is done.
10. THE page SHALL show in the interface that values changed on the module by other means (MIDI from
    a keyboard or DAW, the module's console) are not seen, and that Send all makes the module match
    the page.

### R4. Audition

**User story:** As a sound designer, I want to play voices from the page, so that I can hear edits
without a MIDI keyboard.

Acceptance criteria:
1. THE page SHALL provide a Trigger button for each voice (drum 1, 2, 3, snare, cymbal, closed
   hi-hat, open hi-hat) that sends a note on and then a note off on that voice's channel, using the
   voice's fixed trigger note, or note 60 (C4, the tuned pitch) when the trigger note is 0 (any
   note).
2. THE page SHALL provide a velocity control from 1 to 127 (default 100) and a pitch control that
   sends a different note when a voice accepts any note.
3. WHEN the user presses a mapped computer key (shown on each button), THE page SHALL trigger the
   same voice, and key repeat SHALL NOT retrigger it.
4. THE page SHALL provide Play all, which triggers every voice once in voice order.
5. THE page SHALL provide an All notes off / Panic button that sends note off for every voice's
   notes.

### R5. Undo, compare and sound design helpers

**User story:** As a sound designer, I want to undo edits, compare versions and explore, so that I
can experiment safely.

Acceptance criteria:
1. THE page SHALL keep an undo history of at least 100 steps for the session, with Undo and Redo, and
   SHALL send the changed values to the module when the user steps through it. One slider drag is one
   step.
2. THE page SHALL provide A/B: WHEN the user presses it, THE page SHALL swap the current sound with a
   held snapshot (taken from the current sound when A/B is first pressed) and send the result to the
   module. The snapshot exists only in the page.
3. THE page SHALL provide Revert, which restores the sound as last loaded or saved.
4. WHEN the user presses Randomise on a voice, THE page SHALL set that voice's sound parameters to
   random values inside each parameter's range, with an amount control (0 to 100 %) that scales the
   deviation from the current values, and SHALL NOT change channel, trigger note or level
   (volume/pan/mix) parameters.
5. THE page SHALL provide a Lock toggle per parameter that excludes it from Randomise and from
   Paste.
6. WHEN a randomise, paste or load changes many parameters, THE page SHALL treat it as one undo step.

### R6. Preset library on the computer

**User story:** As a sound designer, I want to save, name and organise sounds, so that I can build a
library and send any of them to the module.

Acceptance criteria:
1. THE page SHALL keep a library in the browser's storage and SHALL show it as a list with name,
   created and modified time, and a free-text tag field.
2. WHEN the user chooses Save to library, THE page SHALL store the current sound under a name of at
   most 8 printable ASCII characters (32 to 126), compatible with the module's preset names and
   `.SND` files, and SHALL refuse a longer or non-ASCII name and say why.
3. WHEN the user chooses Load on a library sound, THE page SHALL make it the current sound and send it
   to the module in full (R3.9).
4. THE page SHALL support Rename, Duplicate and Delete (with confirmation) and sort or filter by name
   and tag.
5. THE page SHALL ask for confirmation before discarding unsaved edits.
6. THE page SHALL provide Initialise, which makes the current sound the factory sound from the
   parameter table defaults.
7. THE page SHALL warn that browser storage can be cleared by the browser, and SHALL provide Export
   library and Import library as a file (R8) so the user can back it up.
8. THE page SHALL NOT send anything off the computer.

### R7. Transfer presets to the module over MIDI

**User story:** As a sound designer, I want to send any library sound to the module and know that it
arrived, so that I can switch sounds from the page during a session.

Acceptance criteria:
1. WHEN the user chooses Send on a library sound, or loads it (R6.3), THE page SHALL transmit every
   sound parameter to the module as CC (parameters 0 to 126) or NRPN (128 and above), each on the
   channel R2.1 gives it, in parameter id order. Only the parameters the firmware accepts over MIDI
   are sent; the MIDI settings are not part of a transfer (R2.3).
2. THE page SHALL show transfer progress (messages sent of total), SHALL pace the messages to the
   31250 baud link in order (an NRPN set is 3 messages, 9 bytes), SHALL finish a
   complete transfer in under 2 seconds for a full sound, and SHALL block triggering until it ends.
3. WHEN the user cancels a transfer, THE page SHALL stop sending, SHALL say that the module now holds
   a mix of the old and new sounds, and SHALL offer Send again.
4. WHEN a transfer ends, THE page SHALL play the test note of R4 if the user enabled Audition after
   send.
5. THE page SHALL provide Send to module on each library entry.
6. THE page SHALL state plainly that a transfer does not write flash: the sent sound is live until
   the next transfer or until the module loses power, after which the module plays its boot slot,
   unless the user stores it (R7.8).
7. THE page SHALL treat sound transfer as complete only when all messages were handed to the MIDI
   output, and SHALL say that arrival at the module cannot be confirmed (R1.4).
8. THE page SHALL provide Store to boot slot. WHEN the user presses it and confirms, THE page SHALL
   send the store command (R11) and SHALL say that the module's live sound, as the page last sent
   it, is now written over its boot slot, that it cannot confirm the write (one-way link), and that
   the slot keeps its existing name on the module.
9. WHILE a transfer is running, or messages are still waiting to be sent, THE page SHALL disable
   Store to boot slot, so the stored sound is the complete sound the user sees.
10. WHEN the page's sound has changes not yet sent (for example, edited while disconnected), THE page
    SHALL send the full sound first and then the store command, as one action.
11. THE page SHALL allow at most one store command per 2 seconds, to protect the flash and give the
    module time to finish the write.

### R8. Files

**User story:** As a sound designer, I want sounds as files, so that I can back up and share them.

Acceptance criteria:
1. WHEN the user chooses Export for a sound, THE page SHALL download a JSON file holding the name,
   parameter names with values, and the identity of the parameter table it was made with.
2. WHEN the user chooses Export library, THE page SHALL download one JSON file with every library
   sound.
3. WHEN the user opens a JSON file, THE page SHALL list its sounds, let the user choose what to add
   to the library, and SHALL change nothing until the user confirms.
4. WHEN a file has a parameter the page does not know, or lacks one it knows, THE page SHALL list the
   differences, ignore unknown names, and take missing parameters from the defaults.
5. WHEN a file has a value outside a parameter's range, THE page SHALL clamp it and report how many
   were clamped.
6. THE page SHALL read an old LXR kit file (`.SND`: 8-byte name followed by parameter bytes in id
   order, shorter files padded with 0), using the same layout as `host/scripts/import_kit.py`.
7. THE page SHALL open, view and export files without a MIDI output.

### R9. Parameter table stays in step with the firmware

**User story:** As the maintainer, I want the page's parameter data to come from the firmware's own
table, so that it cannot silently drift.

Acceptance criteria:
1. THE repository SHALL provide a generator that creates the page's parameter data (id, name, voice,
   group, range, default, named values, CC or NRPN address) from the firmware's parameter table,
   using the same source that generates the README MIDI table.
2. THE repository's test suite SHALL fail when the page's committed parameter data differs from what
   the generator produces.
3. THE page SHALL show the parameter table identity (a hash of the table) in its footer and write it
   into every exported file.
4. THE web UI SHALL live in its own directory. Outside it, the feature SHALL change only what R11
   needs.

### R10. Operation and safety

Acceptance criteria:
1. THE page SHALL treat file contents as data: it SHALL display names and text only as text, never as
   HTML.
2. THE page SHALL work in the current Chrome and Edge on Linux, Windows and macOS.
3. THE page SHALL be usable at window widths from 1024 px up, with keyboard focus and visible labels
   on every control.
4. THE page SHALL send nothing to the module except as the result of a user action (editing a
   control, Trigger, Test, Send all, Load, Undo, Redo, A/B, Randomise, Paste, Panic, Store to boot slot), and SHALL send
   nothing periodically.
5. THE page SHALL cause a flash write on the module only through the store command, sent after an
   explicit Store to boot slot action and its confirmation.
6. THE page SHALL be built with SolidJS, using its latest stable release when implementation starts
   (solid-js 2.0.3 on 2026-11-21), written in TypeScript, and built into static files (HTML, JS,
   CSS) that need no server-side code.
7. THE page's build SHALL pin exact dependency versions with a committed lockfile, so that a later
   build gives the same output.

### R11. Firmware: store the live sound into the boot slot over MIDI

**User story:** As a sound designer, I want the module to keep the sound I made in the page after a
power cycle, without a console.

Acceptance criteria:
1. THE firmware SHALL treat one reserved NRPN number, not used by any parameter, with one specific
   data value as the store command; any other value on that NRPN number SHALL be ignored.
2. WHEN the module receives the store command on any channel it listens on, THE firmware SHALL save
   the live sound to the boot slot exactly as the console's `preset save <boot slot>` does without a
   name: the slot keeps its existing name (or gets `slotNN` if it had none), the MIDI settings are
   saved with it, and the slot stays the boot slot.
3. IF the module is playing the factory sound because no valid boot slot is recorded, THEN THE
   firmware SHALL store into the slot recorded in the globals sector, or into slot 0 when there is
   none.
4. THE firmware SHALL do the flash write on the control core, as console saves do, so audio and MIDI
   input keep running during the write; the MIDI parser SHALL only record the request.
5. WHEN a store request arrives while a previous one is still being written, THE firmware SHALL write
   once more after the current write ends (requests are merged, never queued without limit).
6. WHEN the store completes, THE firmware SHALL print `stored slot <n> '<name>'` on the console if it
   is open, so the command can be checked on the bench.
7. THE firmware SHALL keep every existing behaviour unchanged: all CC and NRPN parameters, the
   console, the preset format and slot layout. Firmware without this change SHALL ignore the store
   command (the NRPN number addresses no parameter), so the page is safe with older firmware.
8. THE host test suite SHALL cover: the store command saves the live sound to the boot slot; a wrong
   data value or a nearby NRPN number does nothing; the factory-sound case of R11.3; and parameter
   CCs and NRPNs behave as before.
9. THE README SHALL document the store command in its MIDI section.

## Out of scope

- Firmware changes beyond R11: no USB MIDI, SysEx, MIDI output, parameter read-back, program change
  or new console commands.
- Using the USB serial console, including its `preset`, `get`, `set` and `status` commands.
- Reading the module's current sound or slots; detecting the module.
- Choosing, loading, listing, reading or naming slots over MIDI, and writing any slot other than the
  boot slot; flash images and UF2 files.
- Changing the module's MIDI settings (channels, trigger notes) from the page.
- Flashing from the browser, and firmware updates.
- Audio in the browser; the sound plays from the module's DAC.
- A sequencer, pattern editing or MIDI file playback.
- Connecting without an interface (browser to module); a DIN MIDI interface is required.

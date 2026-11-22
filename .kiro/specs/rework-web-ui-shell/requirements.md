# Requirements: Rework the web UI shell

## Introduction

The web UI (`/home/chris/Projects/lxr-desktop-app/web`) puts everything that is not a sound control
in stacked rows above the sound controls: a connection row, a toolbar of about twenty items, a
transfer row, and library and importer panels that open in the page flow with a plain Close button.
The sound controls start low on the page and move whenever a panel opens.

This feature reworks that shell. Sound design stays on the surface, everything else is at most two
clicks away, and the whole page is styled like the sound controls. It also settles the sound name
and library rules that the new Save flow needs, and renames the journey headings to what each box
does in the sound chain.

**Constraints:**

- No firmware change and no change to what is sent to the module. Sending, the store command, the
  parameter table and the sound model stay as they are.
- The page stays a SolidJS application with CSS Modules and the tokens of `src/visual/tokens.css`
  (every colour keeps 7:1 contrast on `--bg`, read by `tokens.test.ts`).
- The sound controls (rows, bars, pictures, frames, bridges, threads) are not restyled.

## Glossary

- **App bar**: the slim sticky bar at the top of the page.
- **Shield**: one voice tab (D1, D2, D3, SN, CY, HH, FX). **Shield row**: the tab list plus its roll
  buttons.
- **Side panel**: a panel that slides over the page from the right.
- **Dock**: the audition area at the bottom of the page.
- **Status strip**: the one-line message band directly above the dock.
- **Current sound**: the sound being edited. **Loaded entry**: the library entry the current sound
  was loaded from or last saved to, if any.
- **Journey heading**: the ribbon text of a box of the sound controls.

## Requirements

### R1. App bar

**User story:** As a sound designer, I want the actions of my usual flow in one slim bar, so that
the sound controls start near the top of the page.

Acceptance criteria:
1. THE page SHALL show one sticky app bar of one line at widths of 1100 px and more, containing, in
   this order: the sound name with its Save button (R2), Undo, Redo, A/B, Revert with its menu,
   Copy and Paste (drum voices only, as now), Send all with its menu, then on the right the icon
   buttons Library, Import presets, Settings and Info.
2. THE app bar SHALL NOT contain the connection controls, the one-way and not-sent notices, the
   transfer progress, the Audition after send checkbox, the roll controls or any Close button.
3. Revert SHALL be a split button: the main action reverts to the sound as last loaded or saved;
   its menu has Initialise (factory sound). Initialise SHALL be one undo step and SHALL NOT ask for
   confirmation.
4. Send all SHALL be a split button: the main action sends the whole sound (as the Send all button
   does now); its menu has Seal into boot slot (R5.5) and the Audition after send option.
5. Every icon button SHALL have a visible tooltip and an accessible name. Every split button's menu
   SHALL open with Enter, Space or Down, move with the arrow keys, and close with Escape, which
   returns focus to the button that opened it.
6. WHEN the window is narrower than 1100 px, THE app bar SHALL wrap to two lines and keep the same
   order; no action SHALL be hidden.
7. THE labels Grimoire and Preset importer SHALL be replaced by Library and Import presets in the
   page, in accessible names, in documentation and in tests.

### R2. Sound name and Save

**User story:** As a sound designer, I want to name the sound and save it in one place, so that
saving is a single obvious step.

Acceptance criteria:
1. THE app bar SHALL show the current sound's name as an editable field, 1 to 8 printable ASCII
   characters. A name is trimmed of leading and trailing spaces before it is checked or stored.
2. THE field SHALL NOT accept an empty name. WHEN the field is empty or only spaces, THE page SHALL
   mark it invalid, show "A name is required" under it, and disable Save. WHEN the field loses focus
   while empty, THE page SHALL restore the last valid name. Escape SHALL restore it as well.
3. WHILE the field has focus, THE page SHALL show the character count out of 8.
4. A dot beside the name SHALL show unsaved changes (`isDirty`, R6.5 of the earlier feature: any
   value or the name differs from the loaded or saved sound).
5. Library names SHALL be unique, ignoring case ("Kick1" and "kick1" are the same name).
6. THE Save button SHALL sit directly beside the name and SHALL show one of three states:
   a. **Save**: the name matches no library entry. Pressing it adds the sound to the library and
      does not ask for confirmation.
   b. **Update**: the name matches an entry (case-insensitively), and the sound or the name differs
      from that entry. Pressing it opens a confirmation "Replace the library sound '<entry name>'
      with the current sound?" with Replace and Cancel. Replace updates the entry's values and
      adopts the typed capitalisation as its name.
   c. **Saved**: the name matches the loaded entry and nothing changed. The button is disabled.
7. WHILE the name matches an entry that is not the current state (state Update), THE page SHALL
   show "'<entry name>' exists. Save replaces it" under the name field.
8. THE Save button SHALL have a menu with one item, Rename '<name>'…, enabled only when the current
   sound has a loaded entry. It opens a small dialog with the name field prefilled. The dialog SHALL
   reject an empty name and a name that belongs to a different entry, SHALL accept a change of
   capitalisation only, and SHALL disable Rename while the name is invalid or unchanged.
9. Renaming SHALL change only the library entry's name and the current sound's name; it SHALL NOT
   change values, the baseline values, undo history or what is sent to the module.
10. Enter in the name field SHALL press Save when it is enabled. THE shortcut Ctrl+S (Cmd+S on macOS)
    SHALL do the same and SHALL prevent the browser's save dialog.
11. AFTER a successful Save, Update or Rename, THE status strip SHALL say what happened (R7.4) and
    the dot SHALL disappear.
12. THE name edit SHALL NOT be an undo step. Changing the name SHALL make the sound dirty.

### R3. Library name rules

**User story:** As a sound designer, I want a sound's name to identify it in the library, so that
nothing is stored twice by accident.

Acceptance criteria:
1. `Library.add` SHALL fail with "A sound named '<name>' already exists." when a name matches
   case-insensitively. `Library.rename` SHALL fail the same way for another entry's name.
2. `Library.duplicate` SHALL be removed. THE Library panel SHALL NOT offer Duplicate.
3. WHEN the stored library (`lxr.library.v1`) contains entries whose names match case-insensitively,
   THE page SHALL keep the first by `created` date unchanged and rename each later one: remove the
   trailing digits of the name, then append the smallest number from 2 up that makes the name free,
   shortening the remaining text so the name has at most 8 characters ("Kick1" becomes "Kick2",
   "Kick" becomes "Kick2", "Longnam1" becomes "Longnam2", "Abcdefgh" becomes "Abcdefg2"). THE changed library SHALL be written back, and the Library panel
   SHALL show once "<n> sounds were renamed because names must be unique."
4. WHEN a file import (R6.7 of the earlier feature) or the preset importer adds a sound whose name
   matches an entry, THE page SHALL list the sound as "exists" and untick it. WHEN the user ticks it
   anyway, adding SHALL replace the entry after one confirmation for the whole batch. Sounds with
   the same name inside one batch SHALL be numbered as in criterion 3.
5. THE export and import file formats SHALL NOT change.

### R4. Roll in the shield row

**User story:** As a sound designer, I want to roll the voice I am editing without leaving the
voice tabs, and to roll everything with its own amount.

Acceptance criteria:
1. EACH of the six voice shields SHALL contain, after its label, a dice button "Roll <voice name>"
   and, on the selected shield only, an amount control showing the current percentage.
   The dice button SHALL be visible on the selected shield and on hover or keyboard focus of any
   other shield. The FX shield has neither.
2. Pressing a voice dice button SHALL select that voice's page and randomise that voice (the
   existing `randomise` with locks respected), using the **voice roll amount**.
3. THE amount control SHALL open a popover with a slider 0 to 100 % and the voice roll amount.
   The amount is shared by the six dice buttons.
4. A button labelled "Roll all" SHALL sit right of the shields. Pressing it SHALL randomise every
   voice using the **roll-all amount**. It SHALL have its own amount control (percentage with a
   menu), separate from the voice roll amount.
5. BOTH amounts SHALL be stored in the settings (`lxr.settings.v1`) with default 50 and SHALL
   persist across reloads.
6. EACH roll SHALL be one undo step and SHALL send the changed values as any edit does.
7. THE tab list SHALL keep role `tablist`; the tab button of each shield SHALL be the only element
   with role `tab`, and the dice and amount buttons SHALL be siblings of the tab button inside a
   wrapper, not children of it. ArrowLeft, ArrowRight, Home and End SHALL move between tab buttons
   as now.
8. THE old Roll, Roll <voice> and Roll amount controls SHALL be removed from the toolbar.

### R5. Side panels

**User story:** As a sound designer, I want rarely used features behind an icon, so that they do
not push the sound controls around.

Acceptance criteria:
1. THE icon buttons Library, Import presets, Settings and Info SHALL each open their own side panel
   over the right edge of the page. THE sound controls SHALL NOT move when a panel opens.
2. ONLY one side panel SHALL be open at a time. Pressing the icon of the open panel closes it;
   pressing another icon switches panels.
3. A panel SHALL close with Escape, with a click outside it, and with an X button in its header.
   Panels SHALL NOT have a Close button at the bottom. WHILE a nested dialog is open, Escape SHALL
   close the dialog first.
4. WHEN a panel opens, focus SHALL move into it; WHEN it closes, focus SHALL return to its icon.
   The panel SHALL be a `complementary` region (or a dialog while modal) with an accessible name
   equal to its title.
5. THE Library panel SHALL hold the content of the current library drawer (list, sort, filter,
   tags, Load, Send, Rename, Delete, Export and the entry to Import). Rename SHALL use the dialog of
   R2.8. WHEN the user loads an entry while the current sound has unsaved changes, THE existing
   confirmation SHALL appear, and its text SHALL name the current sound.
6. THE Import presets panel SHALL hold the content of the current preset importer drawer.
7. THE Settings panel SHALL hold the MIDI setup (module channels, trigger notes, keys, default
   velocity and pitch, pause motion) now in the MIDI setup dialog. It is a panel, not a dialog.
8. Seal into boot slot SHALL stay in the Send all menu and SHALL keep its existing confirmation
   dialog. It SHALL be disabled while a transfer or store is pending, as now.
9. THE Info panel SHALL show the parameter table id, the notices "no flash", "one-way link" and
   "values changed on the module are not seen" (the texts now in the footer, connection row and
   toolbar), and the version of the page if the build provides one.
10. THE footer SHALL be removed.

### R6. Audition dock and connection

**User story:** As a sound designer, I want the audition controls and the connection state together
at the bottom, and I want to be able to hide them.

Acceptance criteria:
1. THE dock SHALL be fixed to the bottom of the page and SHALL contain, left to right: the
   connection indicator, the seven rune stones, Velocity, Pitch, Play all, Panic and a collapse
   button. THE collapse button SHALL stay at the bottom right corner of the screen, expanded or collapsed.
2. THE connection indicator SHALL be a pill with a coloured dot and the output name, or
   "Not connected" when no output is selected. The state SHALL NOT be shown by colour alone.
3. Pressing the indicator SHALL open the connection popover above it, with Connect, the output
   select, Test, the status message from `app.conn.message()`, and the one-way notice.
4. WHEN the user presses a rune stone, Play all, Panic, Send all or Seal and no output is selected,
   THE popover SHALL open and the action SHALL NOT run. It SHALL NOT open on page load.
5. THE collapse button SHALL collapse the dock to a thin bar that keeps only a bare connection dot
   (no background, border or pill) and an expand button. THE collapsed dock itself SHALL have a transparent background and no border, outline or gold line, so the page shows through. The dot SHALL stay focusable, SHALL open
   the connection popover, and SHALL show the connection label on hover and focus only; its
   accessible name and `title` SHALL always carry the label. Collapsing SHALL NOT disable the keyboard keys of R4.3 of the earlier
   feature. THE collapsed state SHALL persist in the settings.
6. THE dock SHALL sit at the bottom edge of the page with no reserved row below it. THE page SHALL
   leave bottom padding equal to the dock and strip height so that no control is covered.
7. THE help line for the row being pointed at or focused (the path caption of the earlier feature, 4.12.9)
   SHALL be shown by the dock and not under the page. WHILE the dock is expanded, it SHALL be a second
   row inside the dock, under the controls row and as the lowest line of the page; the row keeps a
   reserved height (one line, three on narrow screens), so text appearing does not change the dock
   height, and no space is left below it. WHILE the dock is collapsed, it SHALL appear right next to
   the connection dot, above all other content, without taking clicks and without covering the expand
   button. It SHALL stay one `aria-live="polite"` region, and use tokens for its colours.
8. THE connection row, the transfer row and the Audition after send checkbox of the page SHALL be
   removed from the main flow; Audition after send is in the Send all menu (R1.4).

### R7. Status strip

**User story:** As a sound designer, I want messages in one predictable place that does not move the
controls.

Acceptance criteria:
1. THE status strip SHALL be a band directly above the dock, and SHALL be visible when the
   dock is collapsed.
2. THE strip SHALL be hidden when there is nothing to show, and SHALL overlay the page edge; showing
   or hiding it SHALL NOT move the sound controls.
3. WHILE a transfer runs, THE strip SHALL show "Sending <sent> / <total>", a progress bar and
   Cancel. AFTER a cancel it SHALL show "Module holds a mix of the old and new sound." and Send
   again. AFTER a transfer ends it SHALL show that the messages were handed to the MIDI output and
   that arrival cannot be confirmed.
4. THE strip SHALL also show: results of Save, Update, Rename, Load and library import; the store
   progress and result (the messages of the current StoreDialog flow); MIDI connection errors
   such as an output disappearing, with a button that opens the connection popover.
5. Success messages SHALL disappear after 5 seconds unless the pointer or focus is on the strip.
   Error messages, the mixed-sound message and progress SHALL stay until dismissed or replaced.
6. THE strip SHALL be filled with a distinct design-token colour per kind (info, success, error)
   with black text, and SHALL have a dismiss button, `role="status"` for progress and success and
   `role="alert"` for errors.
7. THE `TransferStatus` row SHALL be removed.

### R8. Journey headings

**User story:** As a sound designer, I want each box to be named by what it does in the sound
chain.

Acceptance criteria:
1. THE ribbon of each station SHALL show the box's purpose in the sound chain, taken from the
   current subtitles and depending on the voice (`subtitleOf`): Modulator (Noise on the snare),
   Oscillator, Click + the fall (Click on cymbal and hi-hat), Filter, Amp envelope, Drive, Mixer,
   To the speakers. The numerals I to VIII SHALL stay.
2. THE Mentor box ribbon SHALL read "LFO of the voice", THE Bindings box "Modulation targets", THE
   Oracle box "Velocity of the voice". THE Cauldron boxes SHALL read "Effect", "Mix" and "All voices".
3. THE subtitle line below the ribbon SHALL be removed.
4. THE `aria-label` of every box SHALL equal its ribbon text.
5. THE same names SHALL be used for the stations in the caption under the page (the path from a
   row to Return) and in the target labels ("Drum 1 › Filter › cutoff"), including the
   voice-dependent ones.
6. "Mentor" and "Oracle" SHALL be replaced in everything the user sees or a screen reader hears: row
   labels "Mentor to" and "Oracle to" become "LFO to" and "Velocity to" (changed in
   `host/scripts/gen_web_params.py`, then regenerated), the badges `M1`/`O1` become `LFO1`/`VEL1`,
   the incoming list reads "LFO2 (Drum 2) → Drum 1 › Drive › cutoff", and the caption text says
   "LFO" and "Velocity".
7. Code identifiers (`mentor`, `oracle` station ids and kinds, CSS class names, `--oracle`,
   `MentorCard`, `OracleCard`) SHALL NOT change.
8. THE page's documentation (`README.md` Web UI section, `docs/`) SHALL use the new names.

### R9. Styling and accessibility of the shell

**User story:** As a sound designer, I want the shell to look like part of the sound controls.

Acceptance criteria:
1. EVERY shell control (buttons, split buttons, menus, popovers, panels, dialogs, strip) SHALL use
   the tokens of `tokens.css` and no other colour. Panels and popovers SHALL have a `--bg`
   background and a `--line` or `--gold` border, forked ribbon headings where they have a title,
   and the same slim fill-bar for sliders as the sound controls.
2. EACH of the four side panels SHALL have its own small header glyph that fits its content, drawn
   in the same line style as the station glyphs in `visual/glyphs.ts`.
3. THE voice accent (`--voice`) SHALL colour the shields and the roll controls of the selected voice.
4. EVERY interactive element SHALL be reachable by keyboard, show the existing focus outline, and
   have an accessible name. Menus, popovers and dialogs SHALL trap or return focus as in R1.5 and R5.4.
5. THE page SHALL respect `prefers-reduced-motion`: panel slide, popover and strip animations SHALL
   be off when it is set or when the setting `pauseMotion` is on.
6. THE shell SHALL work at widths from 360 px to 2560 px without horizontal scrolling of the shell
   (the station trail may scroll as now).

### R10. Compatibility

Acceptance criteria:
1. THE sent MIDI messages, their order and pacing, the transfer progress numbers, the store command
   flow and the sound model SHALL be unchanged; the existing tests of `state/`, `midi/` and `model/`
   SHALL pass without change except where R2, R3 and R8 require it.
2. THE storage keys `lxr.library.v1`, `lxr.settings.v1` and `lxr.session.v1` SHALL keep their names;
   new settings fields SHALL have defaults so older stored settings load. THE autosave SHALL keep
   the sound name and the loaded entry id.
3. THE production build SHALL stay a static bundle with the existing CSP (`connect-src 'none'`).

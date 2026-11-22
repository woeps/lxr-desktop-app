# Tasks: Rework the web UI shell

Work on a feature branch `feature/web-ui-shell` from `main` in
`/home/chris/Projects/lxr-desktop-app`. Commit after every task. Each task names the requirements it
covers and what must pass before it is checked off. Web tests run with `npm test` and
`npm run typecheck` in `web/`; the generator check with `ctest --test-dir build/host -R web_params`.
Task 12 needs Chris at the browser.

## 1. Library name rules (R3)

- [ ] 1.1 In `state/library.ts` add `nameKey`, `cleanName`, `findByName`, `replace`, `freeName` and
  `renamedOnLoad`; make `add` and `rename` refuse names that exist (case-insensitive); remove
  `duplicate`; add the migration in `parse` with the write-back (design 3.3). Done when
  `library.test.ts` covers the R3.1 and R3.3 cases (including the examples, a three-way duplicate,
  the 8-character limit and a quota failure on write-back) and passes.
- [ ] 1.2 Adapt the importers: `state/importer.ts`, `components/ImportDialog.tsx` and their tests
  for the "exists" note, unticked default, one confirmation for replacing and numbering inside a
  batch (R3.4). Done when `importer.test.ts` and `importer.test.tsx` pass.
- [ ] 1.3 Remove Duplicate from the drawer in `Grimoire.tsx` and show the one-time renamed notice
  (R3.2, R3.3). Done when `grimoire.test.tsx` passes with both changes.

## 2. Session name and save state (R2)

- [ ] 2.1 Add `Session.setName` and `Session.renameBaseline`, keep the autosave and `isDirty`
  behaviour (design 3.2, 3.4). Done when `session.test.ts` shows: no undo step, dirty after a name
  change, name survives the autosave round trip, `renameBaseline` clears the name part of the dirty
  state only.
- [ ] 2.2 Add `state/saveState.ts` and its test with the four kinds and the loaded-entry cases
  (design 3.4). Done when the test passes.

## 3. Settings, roll and status state (R4, R6, R7)

- [ ] 3.1 Add `rollVoice`, `rollAll` and `dockCollapsed` to `state/settings.ts` with sanitising.
  Done when `settings.test.ts` passes with defaults, clamping and a stored object without the new
  fields.
- [ ] 3.2 Add `state/roll.ts` (`rollVoice`, `rollAll`) by moving the bodies out of `Toolbar.tsx`,
  `state/status.ts` (message, 5 s success timer with pause) and `state/shell.ts` (panel and
  connection state, `guardOutput`). Done when unit tests cover one undo step per roll, locks kept,
  the timer with fake timers and one panel at a time.

## 4. Headings and names (R8)

- [ ] 4.1 Move the station name table to `model/headings.ts` (`headingOf(station, voice)`), use it
  in `JourneyPage.tsx`, `Station.tsx` (title is ribbon and `aria-label`, no subtitle element),
  `cards.tsx` and `CauldronPage.tsx`. Done when `journey.test.tsx` and `cauldron.test.tsx` assert the
  table of R8.1 and R8.2 for drum, snare, cymbal and hi-hat, the aria labels and the missing
  subtitle element, and pass.
- [ ] 4.2 Use the table in `model/links.ts` (`stationName`, `targetLabel`, badges `LFO<n>` and
  `VEL<n>`, incoming list) and `model/caption.ts` ("LFO", "Velocity", station path). Done when
  `links.test.ts`, `caption.test.tsx` and `threads.test.tsx` pass with the new strings, including a
  snare "Noise" and a hi-hat "Click" case.
- [ ] 4.3 Change the labels in `host/scripts/gen_web_params.py` to "LFO to" and "Velocity to",
  regenerate `generated/params.ts`, check the badge width in `ParamRow.module.css`. Done when the
  `web_params` ctest and `npm test` pass.

## 5. Shell primitives (R1.5, R9)

- [ ] 5.1 Add `Popover`, `SplitButton`, `visual/shellIcons.ts` and the shared button styles
  (design 4.1, 4.6). Done when `shell.test.tsx` covers open and close by click, Enter, Space,
  arrows, Escape with focus return and outside click, and passes.
- [ ] 5.2 Add the four header glyphs to `visual/glyphs.ts` with tests, and extend `tokens.test.ts`
  to scan the new CSS modules for non-token colours. Done when both pass.

## 6. App bar and name (R1, R2)

- [ ] 6.1 Add `NameSave` and `RenameDialog` (design 3.4): field, count, invalid state, restore on
  blur and Escape, dot, Save states, confirmation, Enter and Ctrl/Cmd+S, rename. Done when
  `name.test.tsx` covers R2.1 to R2.12 and passes.
- [ ] 6.2 Add `AppBar` with Revert and Send split buttons, Copy and Paste, and the four panel
  icons; remove `Toolbar.tsx` and its roll controls; wire `App.tsx`. Done when `shell.test.tsx`
  asserts the order of R1.1, the absence of the items in R1.2, Initialise as one undo step, and the
  wrapping rule, and the existing `app.test.tsx` flows pass.

## 7. Shield row (R4)

- [ ] 7.1 Add `ShieldRow` with dice buttons, the amount popover and Roll all with its own amount;
  remove `VoiceShields.tsx`. Done when `shields.test.tsx` covers R4.1 to R4.8 and the existing tab
  keyboard tests pass.

## 8. Side panels (R5)

- [ ] 8.1 Add `SidePanel` and the panel switching in `App.tsx`; turn `Grimoire.tsx` into
  `LibraryPanel.tsx` and `PresetImporter.tsx` into `ImportPanel.tsx` with the X header, no bottom
  Close, "Library" and "Import presets" names, and Rename through `RenameDialog`. Done when
  `shell.test.tsx`, `grimoire.test.tsx` (renamed) and `importer.test.tsx` pass, including Escape
  order, one panel at a time and focus return.
- [ ] 8.2 Add `SettingsPanel` from `MidiSetupDialog.tsx`, and `InfoPanel` with the table id and
  notices; remove `Footer.tsx` and `MidiSetupDialog.tsx`. Done when the MIDI setup tests are moved
  to the panel and pass, and a test finds the three notices in the Info panel.

## 9. Dock and connection (R6)

- [ ] 9.1 Add `ConnectionPill` and `Dock` from `ConnectBar.tsx` and `AuditionBar.tsx`; add the
  needs-output guard to the stones, Play all, Panic, Send all, Seal and the key handler; remove
  both old components and the Audition checkbox row. Done when tests show the popover opens on a
  guarded action without output and not on load, the existing audition and key tests pass, and
  collapse persists.

## 10. Status strip (R7)

- [ ] 10.1 Add `StatusStrip` with the priority of design 3.6; remove `TransferStatus.tsx`; post
  results from Save, Rename, Load, import and `StoreDialog`; mirror connection errors. Done when
  `transfer.test.tsx` (moved to the strip) and `store.test.tsx` pass and a new test covers
  the timer, hover pause, dismiss and the `status`/`alert` roles.

## 11. Layout and styling (R9)

- [ ] 11.1 Write `AppBar.module.css`, `Panel.module.css`, `Dock.module.css`, the page layout with
  `--dock-h`, the narrow-width wrapping and the reduced-motion rules; remove the unused rules from
  `Shell.module.css`. Done when `npm run build` succeeds, `npm test` and `npm run typecheck` pass
  and headless Chrome screenshots at 1440 x 900 and 390 x 844 show no overlap and no horizontal
  scroll of the shell.

## 12. Acceptance in the browser

- [ ] 12.1 Take the screenshots listed at the end of design section 6 and compare them with the
  agreed mockup. Done when they are in the scratch directory and every difference is fixed or
  listed.
- [ ] 12.2 **[browser]** Chris opens the built page in his browser with the MIDI interface
  connected and checks: Save, Update (confirmation) and Rename on a real sound; a library with
  duplicate names renamed at load; Roll on a voice and Roll all; Send all with the progress strip,
  Cancel, and Send again; Seal into boot slot; collapsing the dock; every side panel by keyboard
  only; and that the page still sounds as before. Done when Chris confirms.

## 13. Documentation and clean-up

- [ ] 13.1 Update the Web UI section of `README.md` and `docs/` for the new layout and names
  (Library, Import presets, LFO, Velocity, Modulation targets). The README stays self-contained and
  does not mention this plan. Done when `readme_midi_map` and the doc tests pass.
- [ ] 13.2 Remove `.kiro/specs/rework-web-ui-shell` with `git rm`; it stays in the git history. Done
  when no file in the repo mentions the spec.

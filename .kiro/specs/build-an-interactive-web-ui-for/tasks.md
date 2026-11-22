# Tasks: Web UI for sound design and preset management

Work on a feature branch `feature/web-ui` from `main` in `/home/chris/Projects/lxr-desktop-app`.
Commit after every task. Each task names the requirements it covers and what must pass before it
is checked off. Host tests run with `ctest --test-dir build/host`; web tests with `npm test` in
`web/`. Tasks marked **[bench]** need Chris at the hardware.

## 1. Firmware: store command (R11)

- [x] 1.1 Add `LXR_NRPN_STORE_BOOT`, `LXR_STORE_BOOT_KEY`, `LXR_NRPN_NULL`,
  `lxr_midi_request_store()` and `lxr_take_store_request()` to `engine/include/lxr/engine.h` and
  `engine/src/engine.c` (design 3.1, 3.2). Done when the engine builds for host and RP2350 and a
  host test shows that two requests before one take give one take, and a request after a take
  gives a second take.
- [x] 1.2 Handle the store command in `midi/src/MIDI/MidiParser.c` (design 3.3); keep the file's
  CRLF line endings. Extend `host/test_midi_parser.c` with the cases of design 3.6 (sequence,
  wrong key, neighbouring NRPNs, stray CC 6 afterwards, channel rules, existing cases unchanged).
  Done when `midi_parser` passes.
- [x] 1.3 Add `lxr_preset_store_boot()` and the `globalsSlot` bookkeeping in
  `engine/src/preset.c` (design 3.4). Extend `host/test_preset.c`: loaded slot keeps its name;
  boot with globals naming a blank slot 3 writes slot 3; blank globals write slot 0 as `slot00`.
  Done when `preset` passes.
- [x] 1.4 Add `on_preset_stored` to `ui_t`, the store step in `ui_poll_all()` and the console
  message (design 3.5). Extend `host/test_console.c` for `stored slot <n> '<name>'`. Done when the
  full host suite passes and the RP2350 release build links, with `LXR_ENABLE_CONSOLE` on and off.
- [x] 1.5 Document the store command in the README "Playing" section (R11.9). Done when
  `readme_midi_map` still passes.
- [x] 1.6 **[bench]** Flash the release build. With the USB MIDI interface wired to the TRS input,
  send the five store messages with `amidi -p <port> -S 'B0 63 7E B0 62 00 B0 06 53 B0 63 7F B0 62 7F'`
  after changing a sound over MIDI. Done when the console prints `stored slot <n> '<name>'`, notes
  keep playing during the write, and after a cold power-cycle the module plays the stored sound.

## 2. Parameter data generator (R9)

- [x] 2.1 Write `host/scripts/gen_web_params.py` reusing `gen_midi_map.py` (design 4.3): `PARAMS`
  with station, order, icon kind, short label, `slotKey`, `inert`, `mix`; `MIDI_SETTINGS`;
  `MOD_TARGETS`; `OUTPUT_CHOICES`; `FX_LABELS`; `STORE` parsed from `engine.h`; `TABLE_ID`. It
  stops with an error naming any parameter without a station, icon or description, and when drum
  1, 2 and 3 do not have the same `slotKey`s. Done when it writes `web/src/generated/params.ts`
  and the station membership matches design 4.12.3 for all six voices and the Cauldron.
- [x] 2.2 Add `--check` and the ctest `web_params` next to `readme_midi_map` in
  `host/CMakeLists.txt` (R9.2). Done when the test passes, and fails after a hand edit of the
  generated file.

## 3. Web project scaffold (R10.6, R10.7, R1.7)

- [x] 3.1 Create `web/` with `package.json` (exact versions of design 4.1), `package-lock.json`
  from `npm install`, `.node-version` (24), `tsconfig.json`, `vite.config.ts` (`base: "./"`, hosts
  bound to 127.0.0.1), `index.html` with the CSP of design 4.10, `src/main.tsx` rendering an empty
  `App`, and `.gitignore` entries for `web/node_modules/` and `web/dist/`. Done when `npm ci`,
  `npm run build` and `npm test` pass with Node 24.
- [x] 3.2 Add `test/safety.test.ts` (no `innerHTML`, `outerHTML`, `insertAdjacentHTML` in
  `web/src`). Done when it passes.

## 4. Model (R3, R5, design 4.4, 4.12.3, 4.12.7, 4.12.8)

- [x] 4.1 `model/params.ts` and `model/sound.ts` (factory, clamp, diff, copy and paste by
  `slotKey`, randomise with injectable random source) with `sound.test.ts`.
- [x] 4.2 `model/history.ts` with `history.test.ts` (one step per drag, 200-step cap, undo and
  redo change sets).
- [x] 4.3 `model/stations.ts` with `stations.test.ts` (each id in exactly one place, hidden
  parameters, visible counts 35/34/35/35, row order).
- [x] 4.4 `model/links.ts` (bindings from all twelve modulators, own and incoming badges, contested
  detection, target labels "voice › station › label") with `links.test.ts`.
- [x] 4.5 `model/levels.ts` (formulas of design 4.12.7) with `levels.test.ts`.

## 5. MIDI output (R1, R3.3, R3.4, R4, R7, design 4.6)

- [x] 5.1 `midi/encode.ts` with `encode.test.ts` (CC and NRPN bytes, channel choice, notes, store
  sequence from `STORE`, panic without CC 120/123, output choices sent as 0/2/3/6 and aliases sent
  unchanged).
- [x] 5.2 `midi/sender.ts` with `sender.test.ts` on a fake output and clock (order, coalescing,
  10 ms per parameter, byte pacing, full transfer under 2 s, cancel, `pending()`, per-id "handed
  to output" events for the row flash).
- [x] 5.3 `midi/access.ts` (secure-context and no-Web-MIDI messages, permission denial, output
  list, saved choice, hot-plug, Test note). Done when its tests with a fake
  `navigator.requestMIDIAccess` pass.

## 6. State, library and files (R2, R6, R8, design 4.5, 4.7, 4.8)

- [x] 6.1 `state/settings.ts` (MIDI setup, key map, velocity, pitch, pause motion) and
  `state/session.ts` (store and context, `applyChanges`, page, pick mode, A/B, revert, session
  autosave). Done when their tests pass.
- [x] 6.2 `state/library.ts` with `library.test.ts` (CRUD, name rule, tags, sort and filter,
  quota error, persistence, `navigator.storage.persist()`).
- [x] 6.3 `files/json.ts`, `files/snd.ts`, `files/download.ts` with `files.test.ts` (round trip,
  unknown, missing and clamped reporting, table id, `.SND` padding and extra bytes, refusal of
  other extensions).

## 7. Visual foundation (design 4.12.1, 4.12.6, 4.12.10)

- [x] 7.1 `visual/tokens.css` (colours, type, ribbons) and the shared CSS Modules setup. Done when
  a token test checks every colour pair of design 4.12.1 is at least 7:1 on black.
- [x] 7.2 `visual/motion.ts` (one loop per page, time-based follow with τ 0.12 s, strike envelope,
  pause, reduced motion, visibility) with `motion.test.ts`.
- [x] 7.3 `visual/icons.ts` with every icon kind of design 4.12.6, and `visual/glyphs.ts` (landmark
  glyphs, seals, stars, chains). Done when `icons.test.ts` passes for all kinds at min, default and
  max.

## 8. Controls and page shell (R3, R4, R10.3, design 4.9)

- [x] 8.1 `ParamRow`, `LiquidBar`, `Chips`, `TargetSelect`: labels, live icon, modified dot, lock,
  reset, badges, keyboard and pointer behaviour of design 4.9; one drag is one undo step; value
  changes go through `applyChanges`. Done when component tests cover keyboard, relative drag,
  Shift fine drag, double-click reset and lock.
- [x] 8.2 `ConnectBar`, `Toolbar` (Undo, Redo, A/B, Revert, Initialise, Send all, Seal into boot
  slot, Save to library, Roll with amount, Copy/Paste on drum pages), `VoiceShields`, `RuneStone`,
  `AuditionBar` (rune stones 1–7, velocity, pitch, Play all, Panic, keys), `Footer` with the fixed
  notices of R1.4, R3.10 and R7.6. Done when the app renders with these and switching a shield
  shows only that voice's controls.

## 9. Journey page (design 4.12.2 to 4.12.5)

- [x] 9.1 `Station`, `MentorCard`, `BindingsCard`, `OracleCard` and `JourneyPage` laid out as in
  design 4.12.2, with ribbon titles, subtitles and rows from `model/stations.ts`.
- [x] 9.2 `visual/frames.ts`: the top-edge frames of design 4.12.4 for all fourteen boxes, built from
  the measured size. Done when each frame stays outside the content padding at the box sizes of
  all six voices.
- [x] 9.3 `visual/vignettes.ts`: the pictures of design 4.12.5 for all voices, including the snare
  noise cloud, the two moons of cymbal and hi-hat, repeat flickers, the two hi-hat flames and the
  FX cauldron in Return. Done when each picture renders at min, default and max values without
  errors.
- [x] 9.4 `CauldronPage`: The Brew, The Pour and The Millstone with their frames and pictures,
  only the parameters the chosen effect uses, and `FX_LABELS`; clicking the Return cauldron opens
  it.
- [x] 9.5 Output handling: four choices, aliases shown as their equivalent, pan dims for left and
  right (`outputs.test.ts`).

## 10. Connections and modulation (design 4.12.7 to 4.12.9)

- [x] 10.1 `JourneyOverlay`: trail with glyphs and seals, the hero walk on strike, bridges with
  sparks, labels and level-based brightness, the fall arc on voices with a pitch envelope, chains;
  geometry from a `ResizeObserver`.
- [x] 10.2 Threads, badges, incoming list, contested styling and pick-to-bind (Esc cancels, Enter
  binds) for the Mentor and the Oracle.
- [x] 10.3 `Caption` and downstream highlighting for station, fall, Mentor, Oracle and Bindings
  rows.
- [ ] 10.4 Measure a full voice page with every animation running in Chrome's performance panel.
  Done when script time stays under 4 ms per frame on Chris's laptop, and the page is still with
  reduced motion on.

## 11. Transfer, store, library and dialogs (R6, R7, R2, R8)

- [ ] 11.1 `TransferStatus` with progress, Cancel, Send again, the hero walking at transfer
  progress, row flashes and "Audition after send".
- [ ] 11.2 `StoreDialog` behind "Seal into boot slot" (R7.8 to R7.11): disabled while sending and
  for 2 s after a store, full transfer first when needed, the result text.
- [ ] 11.3 `Grimoire` drawer (library list, tags, sort and filter, Load, Send, Rename, Duplicate,
  Delete, Export and Import), `ImportDialog`, `ConfirmDialog` for unsaved edits, `MidiSetupDialog`.
- [ ] 11.4 `app.test.tsx`: connect with a fake MIDI access, move a bar and see the CC, seal into
  the boot slot and see the transfer followed by the store command, voice switch, pick-to-bind,
  no-Web-MIDI message.

## 12. Documentation and bench check

- [ ] 12.1 Add a self-contained "Web UI" section to `README.md`: what it does, the MIDI interface
  wiring, building and serving (`npm ci`, `npm run build`, `npm run preview`), supported browsers,
  the one-way link and what "Seal into boot slot" does.
- [ ] 12.2 **[bench]** With Chris, using the USB MIDI interface wired to the module, run the bench
  checks of design section 6: the Test note is heard and bar moves are audible without stutter; a
  library load takes about 0.5 s and the module sounds like the page; seal into the boot slot,
  console shows `stored slot`, and after a cold power-cycle the stored sound plays; dragging a bar
  while drum 1 is played from a keyboard on the same interface drops no notes and the console
  `midi` command shows no new errors.

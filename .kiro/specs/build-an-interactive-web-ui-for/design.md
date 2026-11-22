# Design: Web UI for sound design and preset management

## 1. Overview

The feature has two parts:

1. **Web UI** (`web/` in `/home/chris/Projects/lxr-desktop-app`): a SolidJS 2 single-page app, built
   by Vite into static files. It edits a sound held in the browser and sends it to the module over
   Web MIDI through the user's USB MIDI interface, which is wired to the module's TRS input. The link
   is one-way: the page never receives anything from the module.
2. **Firmware addition** (R11): one reserved NRPN, the **store command**, makes the module save its
   live sound into the boot slot. It is the only firmware change.

The page presents each voice as an illustrated **hero's journey**: the voice's parameters are grouped
into stations along the real signal path, every parameter has a live icon, every station has its own
picture and illustrated frame, and the links between stations and modulators are drawn and animated
(section 4.12).

A third, small part keeps the two in step: a generator (`host/scripts/gen_web_params.py`) turns the
firmware's parameter table into `web/src/generated/params.ts`, and a ctest fails when that file is
out of date (R9).

```
 Browser (Chrome/Edge)                         USB MIDI interface        RP2350 module
 ┌───────────────────────────────┐   Web MIDI   ┌──────────┐  DIN/TRS   ┌──────────────────────┐
 │ UI components (SolidJS)       │ ───────────▶ │ MIDI out │ ─────────▶ │ UART RX (GP1)        │
 │ Session store (sound, undo)   │  CC / NRPN / └──────────┘ 31250 bd   │ MidiParser (core 1)  │
 │ MIDI encoder + paced sender   │  note on/off                         │  ├ params -> engine  │
 │ Library (localStorage), files │                                      │  └ store cmd -> flag │
 └───────────────────────────────┘                                      │ ui_poll_all (core 0) │
                                                                        │  └ flag -> flash save│
                                                                        └──────────────────────┘
```

## 2. Facts from the firmware that the design depends on

All read from the current source:

| Fact | Source |
|---|---|
| CC n (1..127) sets parameter n-1; NRPN n sets parameter 128+n via CC 99 (MSB), CC 98 (LSB), CC 6 (value). CC 38 is a parameter (`filter_freq_1`), not data-entry LSB. | `midi/src/MIDI/MidiParser.c` `midiParser_ccHandler` |
| MIDI reaches ids below `END_OF_SOUND_PARAMETERS` = 247 only. MIDI settings (`midi_chan_1` = 273 and up) are not reachable. | `midiParser_setParam`, `engine/include/Parameters.h` |
| 228 public parameters lie below 247: 123 by CC, 105 by NRPN. No public id is 5, 97, 98 or 127, so CC 6, 98, 99 are free for NRPN use. | `engine/src/param_table.c` |
| A CC owned by a voice is accepted on that voice's channel or the global channel; CCs of shared parameters and all NRPNs on any channel the module listens on. | `MidiParser.c` (`midiParser_cc2voiceNr`, `midiParser_isValidChannel`) |
| Out-of-range values from MIDI are clamped to the maximum. | `midiParser_setParam` |
| The NRPN number stays latched after CC 6, so a later stray CC 6 writes the same NRPN again. | `midiParser_activeNrpnNumber` |
| Note off is ignored. A note on a voice channel plays that voice; when `midi_noteN` is non-zero, only that note triggers it, at the default pitch. | `midiParser_noteOn` |
| The factory sound equals the parameter table defaults (`def`). | `host/test_preset.c` `test_factory_is_initkit` |
| `lxr_preset_save(slot, NULL)` keeps the slot's name (or uses `slotNN`), saves the MIDI settings and makes the slot the boot slot; the flash write keeps audio running (39 ms). | `engine/src/preset.c`, README "Performance" |
| The MIDI parser runs on the audio core (core 1); flash writes happen on the control core (core 0) in its main loop, which calls `ui_poll_all()`. | `engine/include/lxr/engine.h`, `board/rp2350/main.c` |
| `MidiParser.c` uses CRLF line endings. | `file` |

## 3. Firmware addition (R11)

### 3.1 Protocol

| Item | Value |
|---|---|
| Store NRPN number | 16128 (CC 99 = 126, CC 98 = 0) |
| Store key (data entry value) | 83 (`0x53`, "S") |
| After the store command, the page sends the NRPN null | CC 99 = 127, CC 98 = 127 (NRPN 16383) |

The full message sequence, on drum 1's channel `c` (0-based): `Bc 63 7E`, `Bc 62 00`, `Bc 06 53`,
`Bc 63 7F`, `Bc 62 7F`. NRPN 16128 is far above the highest parameter NRPN (117), so firmware
without the addition maps it to id 16256, which `midiParser_setParam` ignores (R11.7).

Constants go into `engine/include/lxr/engine.h`, so the firmware, the host tests and the web
generator read one definition:

```c
/** NRPN number of the store command: CC 99 = 126, CC 98 = 0 (R11). */
#define LXR_NRPN_STORE_BOOT 16128u
/** Data entry value (CC 6) that confirms the store command. Any other value is ignored. */
#define LXR_STORE_BOOT_KEY  0x53u
/** NRPN "null" number; selecting it makes a following CC 6 do nothing. */
#define LXR_NRPN_NULL       16383u
```

### 3.2 Engine API additions (`engine/include/lxr/engine.h`, `engine/src/engine.c`)

```c
/** Audio core: records a store request from MIDI (R11). Never blocks, never writes flash. */
void lxr_midi_request_store(void);
/** Control core: returns 1 and clears the request if one is pending, else 0. */
int lxr_take_store_request(void);
```

Implementation: one `static volatile uint32_t storeRequest`, set with
`__atomic_store_n(&storeRequest, 1, __ATOMIC_RELEASE)` and taken with
`__atomic_exchange_n(&storeRequest, 0, __ATOMIC_ACQ_REL)`. A single flag merges any number of
requests that arrive before the control core takes it, and a request arriving during a flash write
sets it again, which gives exactly one more write afterwards (R11.5).

### 3.3 MIDI parser (`midi/src/MIDI/MidiParser.c`)

In `midiParser_ccHandler`, case `NRPN_DATA_ENTRY_COARSE`, before `midiParser_setParam`:

```c
if(midiParser_activeNrpnNumber == LXR_NRPN_STORE_BOOT) {
	if(msg.data2 == LXR_STORE_BOOT_KEY)
		lxr_midi_request_store();
	midiParser_activeNrpnNumber = LXR_NRPN_NULL;  /* a stray CC 6 later cannot repeat it */
	break;
}
```

The channel rule is the existing one: CC 6 has no owning voice, so it is handled on any channel the
module listens on (R11.2). New lines use CRLF like the rest of the file.

### 3.4 Preset layer (`engine/include/lxr/preset.h`, `engine/src/preset.c`)

```c
/** Saves the live sound to the boot slot like `preset save <slot>` without a name (R11.2, R11.3).
 *  Returns the slot written, or LXR_PRESET_NO_STORAGE. Control core. */
int lxr_preset_store_boot(void);
```

`lxr_preset_boot()` already reads the slot number from the globals sector before it checks that
slot. It now also keeps that number in `static uint8_t globalsSlot` (0 when the globals sector is
blank or corrupt). `lxr_preset_store_boot()` uses `currentSlot` when it is 0..15, otherwise
`globalsSlot`, and calls `lxr_preset_save(slot, NULL)`. No sector format or layout changes (R11.7).

### 3.5 Control core and console (`ui/ui_iface.h`, `ui/ui_iface.c`, `ui/console/console.c`)

`ui_t` gets one optional last member, so existing positional initialisers stay valid:

```c
/** Called on the control core after a MIDI store command was written (slot), or failed (-3). May be NULL. */
void (*on_preset_stored)(int slot);
```

`ui_poll_all()` gains, after `lxr_dispatch_param_events()`:

```c
if(lxr_take_store_request()) {
	const int slot = lxr_preset_store_boot();
	for(int i = 0; i < layerCount; i++)
		if(layers[i]->on_preset_stored) layers[i]->on_preset_stored(slot);
}
```

The write runs whether or not a UI layer is registered, so a build with `LXR_ENABLE_CONSOLE=OFF`
also stores. The console implements `on_preset_stored` and prints
`stored slot <n> '<name>'` or `error: store failed, no preset storage` (R11.6).

### 3.6 Host tests and README (R11.8, R11.9)

- `host/test_midi_parser.c`: the mock gains `lxr_midi_request_store` (counted). Cases: the store
  sequence calls it once and sets no parameter; key 0x52 does nothing; NRPN 16127 and 16129 with
  0x53 do nothing; a CC 6 after a store does nothing; the sequence is accepted on a voice channel
  and on the global channel and ignored on a channel the module does not listen on; existing cases
  unchanged.
- `host/test_preset.c`: with the existing RAM storage mock, `lxr_preset_store_boot` writes the
  live sound to the loaded slot and keeps its name; after a boot whose globals name blank slot 3 it
  writes slot 3; with blank globals it writes slot 0 named `slot00`.
- `host/test_console.c`: `lxr_midi_request_store()` followed by `ui_poll_all()` prints
  `stored slot <n> '<name>'`.
- `README.md` "Playing": one paragraph naming the store command bytes and what it does. The
  generated MIDI table is unchanged, since the store command is not a parameter.

## 4. Web UI

### 4.1 Toolchain (R10.6, R10.7)

| Package | Version (exact pin) | Role |
|---|---|---|
| `solid-js` | 2.0.3 | reactivity, control flow, stores |
| `@solidjs/web` | 2.0.3 | DOM renderer, JSX types (`jsxImportSource`) |
| `@solidjs/vite-plugin` | 3.0.1 | JSX compilation (Solid 2 successor of `vite-plugin-solid`) |
| `vite` | 8.3.8 | dev server and build |
| `typescript` | 7.0.2 | `tsc --noEmit` type check |
| `vitest` | 5.1.1 | unit and component tests |
| `jsdom` | 31.0.1 | DOM for tests |

These are the latest releases on npm on 2026-11-21. Node.js 22.12 or newer is required by the Solid
2 packages; `web/.node-version` pins `24` (fnm reads it; the machine has 22.8.0 today). Dependencies
are installed with `npm ci` from the committed `web/package-lock.json`; `package.json` uses exact
versions (no `^`). No other runtime dependency: Web MIDI, `localStorage`, `crypto.getRandomValues`
and file download are browser APIs.

`web/tsconfig.json`: `"jsx": "preserve"`, `"jsxImportSource": "@solidjs/web"`, `"strict": true`,
`"module"`/`"moduleResolution"`: `"bundler"`. `vite.config.ts`: `plugins: [solid()]`,
`base: "./"` (so `dist/` works from any static path), `server.host: "127.0.0.1"`,
`preview.host: "127.0.0.1"`.

Scripts: `dev` (vite), `build` (`tsc --noEmit && vite build` into `web/dist/`), `preview`,
`test` (`vitest run`). `web/dist/` and `web/node_modules/` are git-ignored.

### 4.2 Source layout

```
web/
  index.html                  root element, CSP meta tag (4.10)
  package.json, package-lock.json, .node-version, tsconfig.json, vite.config.ts
  src/
    main.tsx                  render(<App/>) with @solidjs/web
    App.tsx                   layout, context providers, global keys
    generated/params.ts       written by host/scripts/gen_web_params.py, never edited by hand
    model/
      params.ts               lookups over the generated table (byId, byName, voices, stations)
      sound.ts                Sound type, factory(), clamp(), diff(), voice copy/paste, randomise
      history.ts              undo/redo stack of change sets
    midi/
      encode.ts               pure: parameter/note/store command -> byte arrays + channel choice
      sender.ts               paced send queue with coalescing, progress and cancel
      access.ts               Web MIDI access, output list, hot-plug, persistence of the choice
    state/
      session.ts              the app store: current sound, baseline, A/B, locks, sent-state
      settings.ts             module MIDI setup, key map, velocity, pitch (localStorage)
      library.ts              library CRUD and persistence (localStorage)
    files/
      json.ts                 export/import of the JSON format (4.8)
      snd.ts                  .SND reader
      download.ts             Blob + <a download>
    model/stations.ts         station, Mentor/Bindings/Oracle and Cauldron membership per voice (4.12.3)
    model/links.ts            modulation bindings, incoming badges, contested detection (4.12.8)
    model/levels.ts           signal level estimate along the journey (4.12.7)
    ui/
      ConnectBar.tsx  Toolbar.tsx  VoiceShields.tsx  RuneStone.tsx  JourneyPage.tsx  Station.tsx
      ParamRow.tsx  LiquidBar.tsx  Chips.tsx  TargetSelect.tsx  MentorCard.tsx  BindingsCard.tsx
      OracleCard.tsx  CauldronPage.tsx  JourneyOverlay.tsx  Caption.tsx  AuditionBar.tsx
      TransferStatus.tsx  StoreDialog.tsx  Grimoire.tsx  MidiSetupDialog.tsx  ImportDialog.tsx
      ConfirmDialog.tsx  Footer.tsx
    visual/
      tokens.css              colours, type, spacing (4.12.1)
      frames.ts               one illustrated frame per station and card (4.12.4)
      vignettes.ts            one picture per station and card (4.12.5)
      icons.ts                one live icon renderer per icon kind (4.12.6)
      glyphs.ts               landmark glyphs, seals, stars, chains
      motion.ts               the single animation loop and easing (4.12.10)
      *.module.css            component styles
  test/                       vitest suites (section 6)
```

### 4.3 Generated parameter data (R9)

`host/scripts/gen_web_params.py` imports `read_table`, `read_enums` and `describe` from
`gen_midi_map.py`, so the README table and the web data come from the same parser of
`engine/src/param_table.c`. It writes:

```ts
export const TABLE_ID = "3f9c0a1b7e42d6c5";   // first 16 hex of SHA-256 over the canonical row JSON
export const STORE = { nrpn: 16128, key: 0x53, nullNrpn: 16383 } as const; // parsed from engine.h
export interface ParamDef {
  id: number; name: string; voice: -1 | 0 | 1 | 2 | 3 | 4 | 5;
  kind: "num" | "enum"; min: number; max: number; def: number;
  values?: readonly string[];        // enum names, including the modulation target list
  addr: { cc: number } | { nrpn: number };
  station: Station; order: number;   // where the row sits on the voice page (4.12.3)
  icon: IconKind;                    // live icon renderer (4.12.6)
  label: string;                     // short UI label, e.g. "cutoff"; tooltip = README "Controls" text
  slotKey: string;                   // same for the matching parameter of drum 1, 2 and 3
  inert: boolean;                    // description says "no effect"; hidden under "More"
  mix: boolean;                      // volume, pan, output routing: excluded from Randomise
}
export const PARAMS: readonly ParamDef[];        // the 228 MIDI-reachable sound parameters, id order
export const MIDI_SETTINGS: readonly ParamDef[]; // midi_chan_1..7, midi_chan_global, midi_note1..7 (defaults for R2)
export const MOD_TARGETS: readonly (number | null)[]; // index (as stored in target_lfoN / vel_dest_N) -> parameter id; null for none or a non-public target
export const OUTPUT_CHOICES: readonly { label: "main" | "left" | "right" | "FX"; value: number; aliases: number[] }[];
export const FX_LABELS: Record<"drv" | "rng" | "cmp" | "del", [string, string, string, string]>; // fx_p1..p4 per effect
```

The example `TABLE_ID` value shows the format only; the generator computes the real one.

`Station` is one of `call`, `hero`, `threshold`, `trials`, `ordeal`, `forge`, `roadBack`, `mentor`,
`bindings`, `oracle`, `brew`, `pour`, `millstone`. The generator maps each parameter name to a
station, an order within it, an icon kind and a short label with a regex table next to `DESC`, using
the membership in 4.12.3, and stops with an error naming the parameter when one matches no row, as
`describe` already does. `MOD_TARGETS` is built from `enum_modTargets` by looking each name up in
the table. `OUTPUT_CHOICES` folds the firmware's seven `audio_outN` values onto the one wired stereo
output (St2, L2 and R2 play on St1, L1 and R1, `engine/src/Soundengine.c`): main = 0 (alias 1),
left = 2 (alias 4), right = 3 (alias 5), FX = 6; `fx_routing` uses the first three. `FX_LABELS`
comes from the `fx_p1`..`fx_p4` descriptions. It also checks that drum 1, 2 and 3 have the same set of `slotKey`s, each
used once per voice, and stops otherwise; that is what makes voice copy/paste safe (R3.7).

`--check` compares the output with the committed file. A new ctest `web_params` in
`host/CMakeLists.txt` runs `gen_web_params.py --check` next to `readme_midi_map` (R9.2). The ctest
needs only Python, not Node.

### 4.4 Sound model (`model/sound.ts`, `model/history.ts`)

```ts
type Values = Uint8Array;           // length 247, indexed by parameter id; only PARAMS ids are used
interface Sound { name: string; values: Values }
```

- `factory()`: every `PARAMS` id set to `def` (equals the firmware factory sound, section 2).
- `clamp(id, v)`: into `min..max`.
- `diff(a, b)`: ids whose values differ.
- `copyVoice(src, dst)`, `pasteVoice(...)`: map by `slotKey`, skip locked ids (R3.7, R5.5).
- `randomise(sound, voice, amount, locked, rng)`: for each unlocked, non-`mix`, non-`inert`
  parameter of the voice: numeric `v + round((u - v) * amount)` with `u` uniform in `min..max`;
  enum: with probability `amount`, a uniform random value. `rng` is injectable for tests (R5.4).
- `history.ts`: a step is `{ changes: Array<[id, before, after]> }`. Push, undo and redo return the
  change set to apply and send. Capacity 200 steps, oldest dropped (R5.1, at least 100). A slider
  drag is one step: `LiquidBar` remembers the value at `pointerdown`/first `input` and pushes on
  `change` (release). Randomise, paste, load, revert, initialise and A/B are one step each (R5.6).

### 4.5 Session state (`state/session.ts`)

One `createStore` provided through a context in `App.tsx` (context, not module scope, per the
Solid 2 guidance). Fields:

| Field | Meaning |
|---|---|
| `current: Sound` | the sound being edited |
| `baseline: Sound` | the sound as last loaded or saved to the library (R3.6, R5.3 Revert) |
| `libraryId: string \| null` | library entry the sound came from |
| `abSnapshot: Sound \| null` | the held A/B sound (R5.2) |
| `locked: Set<number>` | locked ids (R5.5) |
| `moduleInSync: boolean` | false when edits were made while no output was selected, after a cancelled transfer, or on a fresh connect; true after a complete transfer (R7.10) |
| `copyBuffer` | the copied drum voice |
| `page: 0..5 \| "cauldron"` | the voice (or the FX page) being shown; only its controls exist in the DOM |
| `pick: "target_lfo" \| "vel_dest" \| null` | pick-to-bind mode of the Bindings card (4.12.8) |

Writes happen only in event handlers and actions, never in memos or component bodies (Solid 2
owned-write rule). Every write that changes `current` goes through one function,
`applyChanges(changes, {send})`, which updates the store, pushes history unless it is replaying
history, and hands the changed ids to the sender. `modified` markers are a memo over
`diff(current, baseline)` (R3.6).

The current sound and A/B snapshot are also saved to `localStorage` key `lxr.session.v1` on every
change (debounced 500 ms), so a page reload does not lose work.

### 4.6 MIDI output

#### Encoding (`midi/encode.ts`, pure)

- **Channel** (R2.1): a parameter with `voice` 0..5 goes on `midi_chan_{voice+1}`; a parameter with
  `voice` -1 and every NRPN go on the global channel when set, otherwise on drum 1's channel. The
  channel values come from the page's MIDI setup (`state/settings.ts`).
- **CC parameter**: `[0xB0|ch, id+1, v]`.
- **NRPN parameter**: three messages `[0xB0|ch, 99, n>>7]`, `[0xB0|ch, 98, n&0x7F]`,
  `[0xB0|ch, 6, v]`, with `n = id-128`. The page always sends all three, so it never depends on the
  module's latched NRPN number, and never sends CC 38 as data-entry LSB.
- **Note**: `[0x90|ch, note, vel]`, then `[0x80|ch, note, 0]` 100 ms later. Note: `midi_noteN`
  when non-zero, else the pitch control (default 60) (R4.1, R4.2). The open hi-hat uses
  `midi_chan_7` and `midi_note7`.
- **Store**: the five messages of section 3.1 (R7.8).
- **Panic** (R4.5): note off for every (channel, note) the page has sent a note on for and not yet
  released. It does not send CC 120 or CC 123, because the module would treat them as parameters
  (ids 119 and 122).

#### Paced sender (`midi/sender.ts`)

The DIN link carries 3125 bytes per second. USB MIDI interfaces buffer only a little and some drop
data when flooded, so the page paces its output itself instead of handing everything to the
browser at once (R3.4, R7.2).

- One FIFO of entries `{ key, bytes, transferId? }`. `key` is `p:<id>` for a parameter,
  `n:<seq>` for notes, `s` for the store command.
- **Coalescing**: enqueuing a parameter whose key is already queued and unsent replaces that
  entry's value in place. A drag therefore never builds up a backlog, and messages stay in order.
- **Per-parameter rate**: an entry for key `p:<id>` is not emitted earlier than 10 ms after the
  previous emission of the same key (R3.4). The final value of a drag is always sent because the
  entry stays queued until emitted.
- **Pacing**: a pump loop emits entries with `output.send(bytes, t)`, where `t` advances by
  `bytes × 376 µs` (320 µs per byte at 31250 baud plus 15 % margin). It schedules at most 30 ms
  ahead of `performance.now()` and re-arms with `setTimeout`. A full transfer is
  123 × 3 + 105 × 9 = 1314 bytes, about 0.5 s (R7.2 limit: 2 s).
- **Transfers**: `sendTransfer(sound)` enqueues every `PARAMS` id in id order with one
  `transferId` and exposes `{ sent, total }` as a signal. `cancel()` removes the transfer's unsent
  entries; up to 30 ms already handed to the browser still go out, which the UI states (R7.3).
  Completion means all entries were handed to `send` (R7.7).
- **Idle**: `pending()` signal is true while anything is queued or scheduled ahead; the UI shows
  it and disables Store while true (R3.4, R7.9).
- With no output selected, the sender drops entries and the session marks `moduleInSync = false`.

#### Access (`midi/access.ts`)

- On Connect: if `!window.isSecureContext`, show the secure-context message (R1.6); if
  `navigator.requestMIDIAccess` is missing, show the browser message and keep the page usable
  offline (R1.5). Otherwise `requestMIDIAccess({ sysex: false })`; a rejection shows "MIDI access
  denied" with how to re-allow it in the site settings.
- Outputs are listed by name; the chosen output's `id` and `name` are saved in `lxr.settings.v1`
  and re-selected on the next visit and on hot-plug. `onstatechange` handles disconnect and
  reconnect (R1.3). After a (re)connect, `moduleInSync` is false and the toolbar shows
  "Module may differ: Send all".
- The Test button sends drum 1's trigger note (R1.4).

### 4.7 Library (`state/library.ts`) (R6)

- `localStorage` key `lxr.library.v1`: `{ version: 1, sounds: LibrarySound[] }`, with
  `LibrarySound = { id (crypto.randomUUID), name, tags: string[], created, modified (ISO), params: Record<name, value> }`.
  Values are stored by parameter name, the same as the file format, so a firmware table change does
  not shift values.
- A sound is about 5 KB of JSON; the 5 MB origin quota holds about 900 sounds. A failed write
  (`QuotaExceededError`) is reported and nothing is lost from memory. On first use the page calls
  `navigator.storage.persist()` and shows the result together with the "browser storage can be
  cleared" warning and an Export library button (R6.7).
- Names: 1 to 8 characters, each 32..126 (R6.2); the check lives in one function shared with
  import.
- Load asks for confirmation when `diff(current, baseline)` is not empty (R6.5), then sets
  `current` and `baseline` and starts a transfer (R6.3, R3.9).
- Initialise sets `current` to `factory()` as one undo step (R6.6).

### 4.8 Files (R8)

JSON format, one shape for a single sound and a library:

```json
{
  "format": "lxr-sounds",
  "version": 1,
  "table": "<TABLE_ID>",
  "sounds": [
    { "name": "Kick 909", "tags": ["kick"], "created": "2026-11-21T21:00:00Z",
      "modified": "2026-11-21T21:05:00Z", "params": { "osc_wave_drum1": 0, "coarse1": 31 } }
  ]
}
```

Import (`files/json.ts`): parse with `JSON.parse`, validate the shape by hand (no `eval`, no
prototype keys: only names found in `PARAMS` are read). Per sound it reports unknown names
(ignored), missing names (factory default) and clamped values (R8.4, R8.5), and a different
`table` id. Nothing changes until the user ticks sounds and confirms (R8.3). An invalid name is
shown and must be fixed in the dialog before import.

`.SND` (`files/snd.ts`, R8.6): bytes 0..7 are the name (up to the first NUL, trailing spaces
removed), byte `8 + id` is parameter `id`. A shorter file pads with 0 (reported as "older
firmware, n parameters set to 0"), extra bytes are ignored and reported, values are clamped. Only
the `.SND` extension is accepted; `.PAT` and others are refused with the same message as
`import_kit.py`.

Downloads use `Blob` and an `<a download>` element; nothing is sent over the network (R6.8).

### 4.9 Screen layout and components

```
┌ ConnectBar: [Connect] Output ▾ ● Connected · one-way link · [Test] [MIDI setup]           pending ◌ ┐
├ Toolbar: Undo Redo | A/B Revert Initialise | Send all [Seal into boot slot] | Save to library  [▤] ┤
├ Banner "Drum 1 · the hero's journey"  Shields: D1 D2 D3 SN CY HH | Cauldron   ✧strike✧  [pause] ┤
│ [Roll] amount ──○   [Copy] [Paste] (drums only)                                                   │
│ ┄┄┄ map trail: landmark glyphs, wax seals I–VIII, the hero walks on strike ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ [I The Call]⌒[II The Hero]⌒[III The Threshold]⌒[IV Road of Trials]⌒[V The Ordeal]⌒[VI The Forge]⌒  │
│ [VII The Road Back]⌒[VIII Return]          (one row; scrolls sideways below 1330 px)              │
│                [Mentor]═chain═[Bindings]═chain═[Oracle]   threads rise to the bound parameters     │
│ Caption: "cutoff shapes The Ordeal → The Forge → The Road Back → Return. Moved by M1"              │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ AuditionBar: rune stones 1–7 in voice colours · velocity ──○ 100 · pitch 60 · [0 All] [Panic]      │
└ Footer: table <TABLE_ID> · the sound lives on the module only until sealed into the boot slot ─────┘
     Grimoire (sound library) opens as a 300 px drawer from [▤] over the left edge
```

- `VoiceShields`: six heraldic shields in the voice colours plus a Cauldron shield for the FX bus;
  `role="tablist"`. Switching changes `page`; the journey, Mentor, Bindings and Oracle then show
  only that voice (R3.1).
- `RuneStone`: the strike pad of the current voice (two stones, closed and open, on the hi-hat
  page). Velocity follows the click height (top = 127, bottom = 1); Space or Enter strikes at the
  audition velocity. It sends the note of R4.1 and starts the strike animation (4.12.10).
- `Station` / `MentorCard` / `BindingsCard` / `OracleCard`: an illustrated frame (4.12.4), a ribbon
  title with a plain subtitle, the picture (4.12.5) and one `ParamRow` per parameter in `order`.
- `ParamRow`: live icon (30 × 18 px), label, modulation badges, value, then the control:
  `LiquidBar` for numbers, `Chips` for lists with up to 4 values, a `<select>` above that,
  `TargetSelect` for `target_lfoN` and `vel_dest_N` (229 targets grouped per voice and station,
  with a "pick" button). A dot in the voice colour before the label marks a modified value (R3.6);
  station ribbons and voice shields show a count. Hover or focus reveals 🔒 lock (R5.5) and ↺ reset
  (R3.5); a locked row keeps its lock visible. Every control has a visible label (R10.3).
- `LiquidBar` (role `slider`): fills in the voice colour; drag is relative to where it is grabbed,
  Shift drags at a quarter of the speed, arrows ±1, Shift+arrows ±10, Home/End, Backspace or
  double-click resets to `def`. One drag is one undo step (4.4).
- `CauldronPage`: the FX bus and the all-voice parameters as three stations (4.12.3); only the
  parameters that the chosen effect uses are shown, with `fx_p1`..`fx_p4` labelled from
  `FX_LABELS`.
- `JourneyOverlay`: one SVG above the page with the trail, seals, bridges, "the fall", threads and
  chains (4.12.7, 4.12.8). Its geometry is recomputed only by a `ResizeObserver`.
- `Caption`: the `aria-live="polite"` line under the journey (4.12.9).
- Toolbar actions: "Roll" is Randomise with its amount (R5.4); Copy and Paste exist on the drum
  pages (R3.7).
- `TransferStatus`: progress bar `sent / total` with Cancel; triggers are disabled while a transfer
  runs (R3.9, R7.2). During a transfer the hero walks the trail at `sent / total` and every
  `ParamRow` flashes white once when its value is handed to the output. After cancel: "Module
  holds a mix of the old and new sound" and Send again (R7.3). Option "Audition after send"
  strikes the current voice when a transfer completes (R7.4).
- `StoreDialog` (R7.8–7.11), opened by "Seal into boot slot" (a wax-seal icon): text from R7.8 and
  R7.6; Confirm is disabled while `pending()` is true or within 2 s of the previous store. On
  confirm: if `!moduleInSync` or the session changed since the last complete transfer, run a full
  transfer first, wait for it to finish, then enqueue the store command. Afterwards show "Store
  command sent at hh:mm:ss. The module writes it over its boot slot; this cannot be confirmed over
  a one-way link."
- `Grimoire`: the library panel of 4.7 in a drawer with a ribbon title "Grimoire" and subtitle
  "sound library"; it overlays the page, so the journey width does not change.
- `MidiSetupDialog` (R2): channel 1..16 per voice slot (7) and global (off, 1..16), trigger note
  0..127 per voice slot, defaults from `MIDI_SETTINGS`, with the R2.3 text and a pointer to the
  console commands `set midi_chan_1 <n>` for changing the module itself.
- Keys (R4.3): `1`–`7` trigger the seven voice slots, `0` Play all (R4.4), `Esc` leaves pick mode,
  all ignored while focus is in a text field or select, and `event.repeat` is ignored. The key map
  is editable in the setup dialog and saved in `lxr.settings.v1`.
- Width (R10.3): from 1024 px up; the journey row is 1330 px wide and scrolls sideways inside its
  region below that, with every control reachable by Tab, which scrolls it into view.
- Notices required by R1.4, R3.10 and R7.6 are fixed texts in `ConnectBar`, `Toolbar` tooltips and
  `Footer`.

### 4.10 Safety (R10)

- All text from files and storage is rendered through JSX text nodes; there is no `innerHTML` in
  the code base, checked by a test that greps `web/src` (R10.1).
- `index.html` sets a Content-Security-Policy meta tag:
  `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:`.
  `connect-src 'none'` enforces "nothing leaves the computer" (R6.8).
- The page sends MIDI only from user actions and the transfers they start; there is no timer that
  sends anything (R10.4). The only path to a flash write is the store command from `StoreDialog`
  (R10.5).

### 4.11 Serving

`npm run build` produces `web/dist/`, a static folder. It works from `npm run preview`
(`http://127.0.0.1:4173`, a secure context), from any static HTTPS host, and from
`python3 -m http.server 8000 --bind 127.0.0.1 --directory web/dist` (R1.7). `file://` is not
supported because browsers do not grant Web MIDI there; the page detects it and says so (R1.6).

### 4.12 Visual and interaction design

The approved mockup (drum 1 with demo values) is the visual specification. Everything in this
section is drawn from parameter values the page holds; the module sends nothing back, so no
picture claims to show the real audio.

#### 4.12.1 Style, colour and type

- **Illustration style:** ink line art in the manner of engraved tarot borders: single-weight
  strokes (1.2 to 1.6 px), filled shapes only for the one accent motif of a frame, no gradients in
  frames or icons. Pictures may use one soft glow (a radial gradient) where the mockup does.
- **Colours** (`visual/tokens.css`), on pure black, every pair at least 7:1:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#000000` | page, cards, controls |
| `--text` | `#ffffff` | text, values, focus ring |
| `--muted` | `#d0d0e4` | subtitles, labels, secondary lines |
| `--line` | `#9a9abc` | control borders, dim guides |
| `--gold` | `#ffd23f` | station frames, ribbons, trail, Mentor |
| `--oracle` | `#a99bff` | Oracle frame, ribbon, threads, badges |
| `--bindings` | `#ffffff` | Bindings frame and ribbon |
| `--contested` | `#ff6680` | contested bindings (4.12.8) |
| `--voice` | per page | fills, accent motifs, active chips |

  Voice colours (the voice "spirits"): drum 1 fire `#ff7a1a`, drum 2 sun `#ffe500`, drum 3 earth
  `#4dff3a`, snare water `#00f0e0`, cymbal air `#3db8ff`, hi-hat aether `#ff4dff`. The Cauldron
  page uses gold. The Oracle colour moved from the mockup's cyan to lavender so it can never be
  mistaken for the snare's water colour.
  `--line` (was `#7a7a9e`, 5.11:1) and `--contested` (was `#ff3b5c`, 6.03:1) were lightened to reach 7:1.
- **Type:** titles in the system serif stack (`Georgia, "Times New Roman", serif`), bold,
  uppercase, letter-spacing 0.08 em; subtitles in the same serif, italic; everything else in
  `system-ui`, values with `font-variant-numeric: tabular-nums`. No web fonts are loaded.
- **Ribbon titles:** a filled band (gold, lavender for the Oracle, white for Bindings) with forked
  ends (`clip-path`), black text; the page banner and the Grimoire use the same ribbon, larger.
- Styles are static CSS Modules. Values that change at run time (bar width, voice colour) are set
  through the CSSOM (`element.style`), which the `style-src 'self'` policy of 4.10 allows.

#### 4.12.2 Page structure

A voice page is the journey of 4.9: eight stations in one row in signal order, the trail above
them, and the Mentor, Bindings and Oracle cards below, joined by chains. Station boxes are 132 px
wide (Return 100 px) with 40 px gaps; Mentor 300 px, Bindings 330 px, Oracle 240 px with 44 px gaps.
The order follows the firmware's drum voice (`engine/src/DSPAudio/DrumVoice.c`): modulator →
oscillator (FM or mix) → plus click → filter → amp envelope → velocity gain → drive → volume
(mixer) → sample-rate reduction and pan (`mixer.c`) → output.

#### 4.12.3 Stations and their parameters

`N` is the voice digit (1 to 3 for the drums). Rows appear in the listed order.

| Station (title · subtitle) | Drum 1–3 | Snare | Cymbal | Hi-hat |
|---|---|---|---|---|
| I The Call · modulator | `fmamntN` FM amount, `fm_freqN` mod pitch, `mod_wave_drumN` mod wave, `mix_mod_N` mode | `noise_freq1` noise pitch, `mix1` noise mix (subtitle "noise") | `wave2_cym`, `mod_osc_f1_cym`, `mod_osc_gain1_cym`, `wave3_cym`, `mod_osc_f2_cym`, `mod_osc_gain2_cym` (moon 1, moon 2) | `wave2_hh`, `mod_osc_f1`, `mod_osc_gain1`, `wave3_hh`, `mod_osc_f2`, `mod_osc_gain2` |
| II The Hero · oscillator | `osc_wave_drumN`, `coarseN`, `fineN`, `pwm_N` | `osc_wave_snare`, `coarse4`, `fine4`, `pwm_4` | `wave1_cym`, `coarse5`, `fine5`, `pwm_5` | `wave1_hh`, `coarse6`, `fine6`, `pwm_6` |
| III The Threshold · click + the fall | `transN_wave`, `transN_vol`, `transN_freq`, `modamntN` fall depth, `mod_egN` fall time, `pitch_slopeN` fall curve | `trans4_*`, `modamnt4`, `mod_eg4`, `pitch_slope4` | `trans5_*` (subtitle "click") | `trans6_*` (subtitle "click") |
| IV Road of Trials · filter | `filter_type_N`, `filter_freq_N`, `reso_N`, `filter_drive_N` | `…_4` | `…_5` | `…_6` |
| V The Ordeal · amp envelope | `veloaN`, `velodN`, `vol_slopeN`, `volume_mod_on_offN` | `veloa4`, `velod4`, `vol_slope4`, `repeat4`, `volume_mod_on_off4` | `veloa5`, `velod5`, `vol_slope5`, `repeat5`, `volume_mod_on_off5` | `veloa6`, `velod6_closed`, `velod6_open`, `vol_slope6`, `volume_mod_on_off6` |
| VI The Forge · drive | `driveN` | `snare_distortion` | `cymbal_distortion` | `hat_distortion` |
| VII The Road Back · mixer | `volN`, `voice_decimationN`, `panN`, `audio_outN` | `…4` | `…5` | `…6` |
| VIII Return · to the speakers | none; shows the result of `audio_outN` | | | |
| Mentor · LFO of the voice | `wave_lfoN`, `freq_lfoN`, `amount_lfoN`, `retrigger_lfoN` ("restarts on" a voice), `offset_lfoN` | `…4` | `…5` | `…6` |
| Bindings · one target each | `target_lfoN` (Mentor →), `vel_dest_N` (Oracle →) | `…4` | `…5` | `…6` |
| Oracle · velocity of the voice | `velo_mod_amt_N` strength | `…4` | `…5` | `…6` |

`voice_lfoN` ("no effect") is not shown. The Cauldron page (FX bus, voice −1) has three stations:
**The Brew · effect** (`fx_type`, then only what it uses: `fx_dist_type` and `fx_p1`..`fx_p4` for
drv, `fx_p1` and `fx_wave` for rng, `fx_p1`..`fx_p4` and `fx_ratio` for cmp, `fx_p1`..`fx_p4` and
`fx_delay_type` for del), **The Pour · mix** (`fx_dry_wet`, `fx_routing` as main/left/right) and
**The Millstone · all voices** (`voice_decimation_all`). `fx_reverb_type` is not shown.

Output (R3.2 with one wired output): `audio_outN` shows main, left, right, FX and `fx_routing`
main, left, right (`OUTPUT_CHOICES`). A stored St2, L2 or R2 shows as its equivalent with a
tooltip "plays as main/left/right"; it is sent unchanged until the user picks a choice. With left
or right, the pan row dims to 40 % opacity and says "no effect: this output sends the voice to one
side only" (the mixer routes L/R without panning).

#### 4.12.4 Frames

Each box is a black shape with a thin outline (1.4 px) in its frame colour, rounded corners (7 px)
and one illustration on its top edge. Nothing is drawn on the sides or the bottom, and nothing
inside the box; content keeps its padding (10 px, 12 px at the bottom). Frames are SVG built in
`visual/frames.ts` from the box's measured size, behind the content, `aria-hidden`.

| Box | Top edge | Top illustration (accent = `--voice`) |
|---|---|---|
| The Call | rippled (one wave per 14 px) | horn in accent at the left corner, three sound ripples |
| The Hero | straight | crown with a gem in accent at the centre |
| The Threshold | arch rising 17 px | keystone at the apex; "the fall" starts here |
| Road of Trials | mountain ridge | white snow caps on the two highest peaks |
| The Ordeal | straight | dragon wings at both top corners, membranes in accent |
| The Forge | straight | hammer at the right corner with accent sparks |
| The Road Back | rolling hills | half sun with rays in accent behind the hills |
| Return | battlements | towers at both corners with accent pennants |
| Mentor | sine wave | spiral, accent star, crescent moon and stars |
| Bindings | straight, white | two interlocked rings at the centre |
| Oracle | straight, lavender | all-seeing eye in a radiant triangle |
| The Brew | cauldron rim | three bubbles in accent |
| The Pour | straight | jug spout pouring at the right corner |
| The Millstone | straight | millstone wheel at the centre |

#### 4.12.5 Pictures

Each box has a picture (SVG, viewBox 200 × 64, 42 px high; Mentor and Oracle 60 px) between the
subtitle and the rows. Inputs are eased values (4.12.10); `glow` is the strike envelope.

| Box | Picture |
|---|---|
| The Call | central orb with a dashed orbit; a moon orbits at a speed from mod pitch, its size and brightness from FM amount, its shape from mod wave; a gold tether while mode is FM. Snare: a noise cloud whose dot density is noise mix and jitter speed noise pitch. Cymbal and hi-hat: two moons on two orbits |
| The Hero | crystal whose outline is the waveform (circle, triangle, slanted triangle, square, jagged star, pulse bar with width from pulse width); smaller and faster-breathing as pitch rises; fine tune tilts it; a glow flares on strike |
| The Threshold | falling star: path from fall depth (height), fall time (length) and fall curve; sparks at its start, count from click level, length from click pitch, rotated by click sample; a white dot runs the path on strike. Cymbal and hi-hat: sparks only |
| Road of Trials | aurora curtain shaped like the filter response of type, cutoff and resonance; thickness and glow from filter drive; a slow shimmer |
| The Ordeal | flame whose outline is the amp envelope (attack, decay, curve); a white line rises through it on strike; an up-arrow in lavender when velocity → loudness is on. Snare and cymbal: one small flicker per repeat step; hi-hat: two flames, closed and open |
| The Forge | clipped sine whose clipping follows drive, with rising embers, count from drive |
| The Road Back | orb on a horizon: position from pan (pinned left or right for those outputs), size from volume, outline polygon with fewer sides as sample rate drops |
| Return | speaker with sound arcs on the output side(s), brightness from the estimated level (4.12.7); for FX a bubbling cauldron with "to the Cauldron (FX)" under it, which opens the Cauldron page on click |
| Mentor | the LFO wave over two cycles (shape, amount, start phase) with a star-shaped wisp travelling at the LFO rate; a marker "restarts on <voice>" when retrigger is set |
| Oracle | rune ring whose rays grow with strength and flare on strike |
| The Brew | per effect: still cauldron (off), flames from fx_p1 (drv), a ring wobbling with fx_wave at fx_p1 rate (rng), a lid pressed down by threshold and ratio (cmp), echo ripples spaced by time and fading by feedback (del) |
| The Pour | a stream whose width is dry/wet, falling to the output side |
| The Millstone | a wheel outline with fewer sides as the all-voice sample rate drops |

#### 4.12.6 Live parameter icons

Every row has an icon (30 × 18 px) drawn from the row's eased value `u` (0..1) or list index `w`,
in the voice colour, redrawn when the value changes. Most icons plot a function `y(x)` over
`x ∈ [0, 1]` with 25 points; the others are small glyphs.

| Kind | Parameters | Icon |
|---|---|---|
| `wave` | every oscillator and modulator waveform, `fx_wave` | two cycles of the chosen waveform |
| `pitch` | `coarse*` | sine with 1 + 6u cycles |
| `fine` | `fine*` | sine shifted by (u − ½) |
| `pwm` | `pwm_*` | pulse with duty 0.1 + 0.8u |
| `fma` | FM amounts | sine with FM depth u |
| `fmf` | modulator pitches | sine with 1 + 9u cycles, smaller |
| `mode` | `mix_mod_*` | FM-bent sine or a sum of two sines |
| `noise` | `noise_freq1` | noise burst, density from u |
| `nmix` | `mix1` | sine cross-fading into noise by u |
| `tw` / `tv` / `tf` | click sample / level / pitch | decaying click; pattern from w, height u, frequency u |
| `da` / `dt` / `dc` | fall depth / time / curve | falling pitch line |
| `ft` / `fc` / `fq` / `fd` | filter type / cutoff / resonance / filter drive | response curve; knee at u; peak u; soft clip u |
| `aa` / `ad` / `ac` / `rp` | attack / decay (both hi-hat decays) / curve / repeats | envelope shape; repeats as 1 + repeats decays |
| `dr` | drives | sine clipped by 1 + 8u |
| `vo` | volumes | sine with amplitude u |
| `dec` | sample rates | sine in 3 + 25u steps |
| `pan` | pans | line with a dot at u |
| `out` | outputs, `fx_routing` | arrows to both sides, left, right, or a cauldron |
| `lw` / `lr` / `la` / `lo` / `rt` | LFO shape / rate / amount / start phase / restarts on | LFO wave; cycles; amplitude; phase; circular arrow (crossed when off) |
| `link` | `target_lfoN`, `vel_dest_N` | two chain links, gold or lavender when bound |
| `tog` | `volume_mod_on_off*` | switch |
| `va` | velocity strengths | rising wedge with slope u |
| `fxt` / `fxd` / `fxp` / `rat` / `dw` / `dly` | effect type / distortion type / fx_p1..p4 / ratio / dry-wet / delay type | effect glyph; clip shape; arc gauge at u; compression curve; two waves cross-fading; echo dots on one side (Del) or alternating (Pp) |

#### 4.12.7 Connections and the level estimate

- **Trail:** a winding dotted gold path above the stations; each station has a wax seal (I to
  VIII) and above it a landmark glyph: horn, sword, gate, mountains, flame, anvil, signpost,
  castle. On strike, a star walks the trail in `0.25 s + min(1.2 s, attack + decay)` and fills each
  seal and glyph as it passes.
- **Bridges** between stations: an arched double line (signal and gold rail) with a chevron, two
  white spark stars travelling along it. Label above the first, third and fifth bridge: "FM" or
  "mix", "+click" when click level > 0, "×vel" when velocity → loudness is on.
- **The fall:** a dotted arc from the Threshold keystone to the Hero's crown with a star at its
  end, labelled "the fall", width from fall depth; it lights while the pitch drop runs after a
  strike. Not drawn on voices without a pitch envelope (cymbal, hi-hat).
- **Level estimate** (`model/levels.ts`), one value per bridge, each clamped to 0.06..1:
  L0 = FM amount; L1 = L2 = 1; L3 = filter pass `fp` (LP and LP2: 0.15 + 0.85·cutoff, HP: 0.15 +
  0.85·(1 − cutoff), off: 1, other types 0.6); L4 = fp · amp, where amp is the strike glow, at
  least 0.25; L5 = min(1, L4 · (1 + 0.4·drive)); L6 = L5 · volume. A bridge's opacity is
  max(0.35, L), its spark size 2 + 2.5·L.

#### 4.12.8 Modulation: Mentor, Oracle, Bindings

Firmware facts (`engine/src/engine.c`, `modulationNode.c`): each voice has one LFO and one
velocity modulator; each has exactly one destination from the kit-wide list of 229 targets; a
modulator writes its target as "original value plus its offset", so two modulators on the same
parameter do not add up, the one that updates last wins.

- The **Mentor** card holds only the LFO's character; the **Bindings** card holds only where the
  Mentor and the Oracle act; the **Oracle** card holds only velocity strength. If the firmware
  later allows several targets per LFO, Bindings becomes a list without changing the Mentor card.
- `TargetSelect` lists all 229 targets grouped as voice › station › label; targets on other voices
  read "(other voice)". "pick" enters pick mode: journey rows get a dashed gold outline and a
  crosshair; clicking a row (or Enter on its control) binds it; Esc or "pick" again cancels.
- **Threads** from the Bindings card rise and run to the bottom of the bound station: gold for the
  Mentor, wiggling with LFO amount and rate; lavender for the Oracle, flashing white on strike;
  twinkling white dots travel along both. A star sigil marks each end. Bindings to another voice
  draw no thread; the row says where it acts.
- **Badges** on a bound row: `M<n>` (Mentor of voice n) or `O<n>`, with a gold or lavender ring.
  `model/links.ts` reads all twelve bindings of the kit, so modulation arriving from other voices
  shows as badges too, listed read-only under the Bindings card ("Incoming from other voices, set
  on their pages").
- **Contested:** when two or more modulators share a target, the row ring, the badges and the
  threads turn `--contested` (threads dashed), and the caption says "contested: the one that
  updates last wins".

#### 4.12.9 Caption and highlights

Pointing at or focusing a row lights everything downstream: the bridges from its station on turn
gold and thicker, and the caption names the path, for example "cutoff shapes The Ordeal → The Forge
→ The Road Back → Return. Moved by M1". Fall rows light the fall arc and the path from the Hero.
Mentor, Oracle and Bindings rows light their thread and the path from the bound station.

#### 4.12.10 Motion

- One `requestAnimationFrame` loop per page (`visual/motion.ts`), using time, not frames: `dt`
  clamped to 1/30 s. A value set by input becomes a target; the shown value follows with
  `x += (target − x)·(1 − e^(−dt/0.12))` and snaps when within 0.02.
- A strike sets an envelope from the amp envelope parameters (rise of at least 50 ms) scaled by
  velocity; it drives `glow`, the hero walk, the fall and the Oracle flash.
- Ambient motion (orbits, wisp, embers, shimmer, sparks, thread dots) runs only while the page is
  visible (IntersectionObserver and `document.hidden`) and "pause motion" is off; the loop stops
  when nothing moves and restarts on the next input. "pause motion" is stored in
  `lxr.settings.v1`.
- With `prefers-reduced-motion: reduce`, values jump to their targets, there is no ambient motion
  and no strike animation, and everything still responds to input.
- Only SVG attributes and transforms change per frame; layout is measured only on resize. Budget:
  under 4 ms of script per frame for a full voice page on a 2020-class laptop.

#### 4.12.11 Accessibility

All frames, pictures, icons and the overlay are `aria-hidden`; each box is a `<section>` labelled
"<title>, <subtitle>"; rows hold real controls with labels; the caption is `aria-live="polite"`.
Colour is never the only signal: badges carry text, contested threads are also dashed, seals carry
numerals. Focus shows a 2 px white outline.

## 5. Requirement traceability

| Requirement | Where |
|---|---|
| R1 Connect | 4.6 Access, `ConnectBar`, 4.11 |
| R2 MIDI setup | `state/settings.ts`, `MidiSetupDialog`, 4.6 Encoding (channel) |
| R3 Edit | `ParamRow`, `LiquidBar`, `Station`, `VoiceShields`, `CauldronPage`, 4.4, 4.5, 4.6 sender, 4.12 |
| R4 Audition | `AuditionBar`, `RuneStone`, 4.6 Encoding (note, panic), 4.9 keys |
| R5 Undo/A-B/helpers | `model/history.ts`, `model/sound.ts`, 4.5 |
| R6 Library | 4.7, `Grimoire` |
| R7 Transfer and store | 4.6 sender, `TransferStatus`, `StoreDialog`, section 3 |
| R8 Files | 4.8, `ImportDialog` |
| R9 Table in step | 4.3, ctest `web_params` |
| R10 Safety, stack, width | 4.1, 4.9 (width), 4.10, 4.12.11 |
| R11 Firmware | section 3 |

## 6. Testing

**Host (ctest, existing suite):** the R11 cases in section 3.6, `web_params` (4.3), and every
existing test unchanged (golden renders, `readme_midi_map`, parameter table, presets).

**Web (vitest + jsdom, `npm test` in `web/`):**

| Suite | Checks |
|---|---|
| `encode.test.ts` | CC and NRPN bytes for first/last ids; channel choice per voice and global; store sequence equals the five messages of 3.1 built from `STORE`; panic sends no CC 120/123 |
| `sender.test.ts` | with a fake `MIDIOutput` and fake clock: order kept; coalescing during a drag; 10 ms per-parameter spacing; byte pacing (no two sends closer than `bytes × 376 µs`); full transfer finishes under 2 s of fake time; cancel drops unsent entries; `pending()` |
| `sound.test.ts` | factory equals `def`; clamp; diff; drum paste maps by `slotKey` and skips locks; randomise stays in range, skips mix/locked/inert, amount 0 changes nothing |
| `history.test.ts` | drag = one step; 200-step cap; undo/redo change sets |
| `library.test.ts` | CRUD, name rule, quota error handling, persistence round trip |
| `files.test.ts` | JSON export/import round trip; unknown/missing/clamped reporting; `.SND` read of a file produced by `host/scripts/import_kit.py` test data (padding, extra bytes, refusal of `.PAT`) |
| `app.test.tsx` | render `<App/>` into jsdom with a fake `navigator.requestMIDIAccess`: connect, move a slider, see the CC go out; Store dialog sends the transfer then the store command; no-Web-MIDI message; voice shields show only that voice's controls; pick-to-bind binds a row and draws its thread |
| `stations.test.ts` | every `PARAMS` id lands in exactly one station or card except `voice_lfoN` and `fx_reverb_type`; visible rows per voice: drums 35, snare 34, cymbal 35, hi-hat 35; order matches 4.12.3 |
| `icons.test.ts` | every `IconKind` in `PARAMS` has a renderer; each returns a path inside the 30 × 18 box for min, default and max |
| `levels.test.ts` | the formulas of 4.12.7: cutoff 0 on LP floors L3..L6, volume 0 floors L6, filter off passes 1 |
| `links.test.ts` | `MOD_TARGETS` round trip; badges for own and incoming bindings; contested when two of the twelve share a target, and only then |
| `outputs.test.ts` | St2/L2/R2 shown as main/left/right and sent unchanged; picking main/left/right/FX sends 0/2/3/6; pan dims for left and right |
| `motion.test.ts` | follow converges and snaps; loop stops when settled; reduced motion jumps; pause stops ambient motion |
| `safety.test.ts` | no `innerHTML` / `outerHTML` / `insertAdjacentHTML` in `web/src` |

`npm run build` must pass (`tsc --noEmit` and Vite).

**Bench (manual, with Chris):** with the USB MIDI interface wired to the module:
1. Connect, Test note is heard; slider moves are audible without stutter.
2. Load a library sound: transfer completes in about 0.5 s and the module sounds like the page.
3. Store to boot slot, console shows `stored slot <n> '<name>'`; after a cold power-cycle the
   module plays the stored sound.
4. Drag a slider while hammering drum 1 from a keyboard on the same interface: no stuck or dropped
   notes, `midi` console command shows no new errors.

## 7. Decisions and alternatives

| Decision | Chosen | Rejected because |
|---|---|---|
| Store trigger | Reserved NRPN with a key value | Program change: a DAW sends it on project load; SysEx: needs a SysEx parser and the page would need SysEx permission |
| Store target | boot slot, name kept | user decision; a named or chosen slot needs more NRPNs |
| Library storage | `localStorage` | IndexedDB holds more, but 900 sounds is ample and `localStorage` is simpler to test; export files are the backup |
| Pacing | page-side paced queue | sending everything at once relies on each interface's buffer size |
| NRPN encoding | always full CC 99/98/6 | skipping repeated CC 99 saves 3 bytes per NRPN but depends on module state the page cannot see |
| Page theme | hero's journey with illustrated stations (4.12) | plain grouped panels: works, but the user asked for a visual, playful page |
| Parameter grouping | stations in the firmware's signal order | the firmware's technical groups hide how parameters affect each other |
| Number control | liquid bar with relative drag | rotary knobs (less exact with a mouse), elastic string and paint bars (taller, coarser) |
| More modulation | per voice: own Mentor and Oracle, incoming shown read-only, contested flagged | a kit-wide pool on every page shows other voices' controls; several targets per LFO needs firmware work beyond R11 |
| Outputs | four choices, aliases folded | seven values, three of which play identically on the one wired output |
| Frames | one top illustration per box on a plain outline | ornate full borders were too busy |
| Title font | system serif stack | a bundled display font adds an asset for little gain |
| Oracle colour | lavender `#a99bff` | cyan clashed with the snare's voice colour |
| Component tests | own jsdom harness via `render` from `@solidjs/web` | `@solidjs/testing-library` has no release that declares Solid 2 support |

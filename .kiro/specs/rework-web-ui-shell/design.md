# Design: Rework the web UI shell

All paths are under `/home/chris/Projects/lxr-desktop-app/web/src` unless they start with `host/`.
The code follows the existing conventions: SolidJS 2 (`createEffect` with split compute and apply,
`flush()` after store writes), CSS Modules, colours only from `visual/tokens.css`.

## 1. Page structure

```
App
 ├─ AppBar            sticky, one line (R1)
 │   ├─ NameSave      name field, dot, Save, Save menu (R2)
 │   ├─ history group Undo, Redo, A/B, Revert split (Initialise)
 │   ├─ CopyPaste     drum voices only
 │   ├─ SendSplit     Send all, menu: Seal, Audition after send
 │   └─ PanelIcons    Library, Import presets, Settings, Info
 ├─ ShieldRow         tabs with roll buttons, Roll all (R4)
 ├─ VoicePage         unchanged apart from headings (R8)
 ├─ SidePanel         one at a time, over the right edge (R5)
 ├─ Dock              connection pill, stones, Velocity, Pitch, Play all, Panic, collapse (R6)
 └─ StatusStrip       below the dock (R7)
```

The page is a column: app bar, shield row and voice page in a scrolling area, dock and strip fixed
below it. The scrolling area has bottom padding equal to the dock plus strip height (measured with a
`ResizeObserver` and written to a CSS variable `--dock-h`). The strip is `position: absolute` above
the page's bottom edge so that showing it does not change `--dock-h`; the padding always includes
one strip height.

## 2. Files

| Action | File |
|---|---|
| New | `components/AppBar.tsx`, `NameSave.tsx`, `RenameDialog.tsx`, `SplitButton.tsx`, `Popover.tsx`, `ShieldRow.tsx`, `SidePanel.tsx`, `ConnectionPill.tsx`, `Dock.tsx`, `StatusStrip.tsx`, `InfoPanel.tsx`, `SettingsPanel.tsx`, `AppBar.module.css`, `Panel.module.css`, `Dock.module.css` |
| New | `state/shell.ts` (open panel, connection popover), `state/status.ts` (strip message), `state/saveState.ts` (R2.6 logic), `state/roll.ts`, `visual/shellIcons.ts` (button icons), header glyphs added to `visual/glyphs.ts` |
| Renamed | `Grimoire.tsx` to `LibraryPanel.tsx`; `PresetImporter.tsx` to `ImportPanel.tsx`; `MidiSetupDialog.tsx` content moves to `SettingsPanel.tsx`; test files follow |
| Changed | `App.tsx`, `Station.tsx`, `JourneyPage.tsx`, `CauldronPage.tsx`, `cards.tsx`, `ParamRow.module.css` (badge text only), `Shell.module.css` (old row styles removed), `model/links.ts`, `model/caption.ts`, `state/library.ts`, `state/settings.ts`, `state/session.ts`, `state/importer.ts`, `components/ImportDialog.tsx`, `components/StoreDialog.tsx` (messages go to the strip), `host/scripts/gen_web_params.py`, `generated/params.ts` (regenerated) |
| Removed | `Toolbar.tsx`, `ConnectBar.tsx`, `TransferStatus.tsx`, `AuditionBar.tsx`, `Footer.tsx`, `VoiceShields.tsx`, `MidiSetupDialog.tsx` |

## 3. State

### 3.1 Settings (R4.5, R6.5)

`Settings` gains `rollVoice: number`, `rollAll: number` (0..100, default 50) and `dockCollapsed:
boolean` (default false). `sanitize` clamps and defaults them, so older stored settings load.

### 3.2 Session name (R2.12)

`Session.setName(name: string): void` writes `current.name`. It does not touch history, does not
send, and schedules the autosave like other writes. `isDirty` already compares names. `load` and
`markSaved` keep their meaning: both set `baseline.name` from the sound they take.

### 3.3 Library names (R3)

```ts
export const nameKey = (n: string) => n.trim().toLowerCase();
interface Library {
  findByName(name: string): LibrarySound | undefined;   // case-insensitive
  add(name, sound, tags?): LibraryResult<LibrarySound>; // fails: A sound named '<name>' already exists.
  replace(id: string, name: string, sound: Sound): LibraryResult; // values and name, one write
  rename(id, name): LibraryResult;                       // fails for another entry's name
  readonly renamedOnLoad: number;                        // for the one-time notice (R3.3)
}
```

`duplicate` is removed. `nameError` stays the single syntax rule; a new `cleanName(raw)` trims
and is applied before `nameError`, `add`, `rename` and `replace`. A name of only spaces trims to
empty and fails with the existing "A name needs at least 1 character."

**Migration in `parse`:** after reading the valid entries, sort a copy by `created` (stable), walk it
keeping a set of `nameKey`s; for an entry whose key is taken, build the new name
`stem = name.replace(/\d+$/, "")`, then for k = 2, 3, … `cand = stem.slice(0, 8 - String(k).length) + k`
until `nameKey(cand)` is free (an empty `stem` becomes `"s"`); count the renames. `createLibrary`
writes the corrected list back once when the count is above zero and exposes `renamedOnLoad`; a
failed write (quota) keeps the in-memory fix and leaves the stored list as is.

**Importers:** `importer.ts` and `ImportDialog.tsx` compute `exists` per entry with `findByName`
and numbering within the batch with the same suffix function (exported as `freeName(name, taken)`).
An entry that exists starts unticked with the note "exists, will be replaced". `addTicked` and `add`
call `replace` for existing names after one `ConfirmDialog` for the batch, and `add` otherwise.

### 3.4 Save state (R2.6)

`state/saveState.ts` is a pure function with no Solid imports:

```ts
type SaveState =
  | { kind: "invalid"; reason: string }
  | { kind: "save" }                              // no entry of that name
  | { kind: "update"; entry: LibrarySound }       // entry exists, state differs
  | { kind: "saved"; entry: LibrarySound };       // entry is the loaded one and not dirty
saveState(name, library, loadedId, dirty): SaveState
```

`saved` requires `loadedId === entry.id` and `!dirty`; a typed name that matches a different entry
than the loaded one is always `update`. `NameSave` renders the button and hint from it:

- `save`: `library.add(name, current)` then `session.markSaved(id)`, strip message.
- `update`: `ConfirmDialog` "Replace the library sound '<entry.name>' with the current sound?",
  then `library.replace(entry.id, cleanName(name), current)`, `session.setName(cleanName(name))`,
  `session.markSaved(entry.id)`.
- Rename (R2.8): `RenameDialog` calls `library.rename(loadedId, newName)` and `session.setName`; it
  does not call `markSaved`, so unsaved value edits stay unsaved. It also sets
  `session.state.baseline.name` through a new `session.renameBaseline(name)` so the dot reflects the
  values only.

The name input keeps its text in a local signal. On input it calls `session.setName` only for valid
names; on blur an empty value restores `session.state.current.name`.

### 3.5 Shell state (`state/shell.ts`)

```ts
type PanelId = "library" | "import" | "settings" | "info";
createShell(): { panel(): PanelId | null; toggle(id): void; close(): void;
                 connectionOpen(): boolean; openConnection(): void; closeConnection(): void;
                 lastIcon(): HTMLElement | null }   // focus return target
```

`App` creates it once and provides it with a context next to `AppContext`. The panel contents mount
only while open, like the current drawers, but `importer` state is created once in `App` as now so
the list survives closing.

**Needs-output guard:** `guardOutput(app, shell, fn)` returns a function that runs `fn` when
`app.hasOutput()` and otherwise calls `shell.openConnection()`. The dock stones, Play all, Panic,
the keyboard handler in `App.tsx`, Send all and Seal are wrapped in it. Test stays disabled until an
output exists, as now.

### 3.6 Status strip (`state/status.ts`)

```ts
type Status = { kind: "success" | "info" | "error" | "note"; text: string; action?: {label; run} };
createStatus(): { current(): Status | null; say(s: Status): void; dismiss(): void }
```

`say` replaces the current message and, for `success` only, starts a 5 s timer that is paused
while the strip has pointer hover or focus. `StatusStrip` shows, in this priority:

1. a running transfer (`app.progress()`, `app.busy()`): count, `<progress>`, Cancel;
2. after a cancel (`app.cancelled()`): the mixed-sound note and Send again;
3. a posted message;
4. after a completed transfer: the "handed to the MIDI output" text, until dismissed or replaced.

Items 1 to 4 reuse the logic of `TransferStatus` unchanged. `StoreDialog` keeps its dialog and posts
its result with `say`. `app.conn.message()` errors (output disappeared, access denied) are
mirrored into the strip by an effect in `App`, with the action "Open connection".

### 3.7 Roll (`state/roll.ts`)

`rollVoice(app, voice, amount)` and `rollAll(app, amount)` are the two bodies currently inline in
`Toolbar.tsx`, with the same `randomise` call and locks, applied through one `applyChanges`. The
voice dice button calls `session.setPage(voice)` first, then `rollVoice`. Both read the amounts from
settings.

## 4. Components

### 4.1 `Popover` and `SplitButton`

`Popover({ open, onClose, anchor, placement, role, label, children })` renders its children in place
(not in a portal, so it stays inside the dashboard's stacking context) with `position: absolute`
under or over the anchor. It closes on Escape (returning focus to the anchor), on a pointerdown
outside, and when focus leaves it. A menu uses `role="menu"` with `menuitem` buttons, roving
`tabindex`, ArrowUp, ArrowDown, Home, End. A popover with controls (roll amount, connection) uses
`role="dialog"` and does not trap focus.

`SplitButton({ label, icon, onPress, menu, disabled, accent })` renders two buttons in one group
with `aria-haspopup="menu"` and `aria-expanded` on the caret, and shares the Popover.

### 4.2 `ShieldRow` (R4)

```tsx
<div role="tablist" aria-label="Voices">
  <For each={PAGES}>{p =>
    <span class={styles.shield} data-selected=…>
      <button role="tab" …/>                        // existing tab behaviour
      <Show when={isVoice(p)}>
        <button aria-label={`Roll ${p.name}`} …/>   // dice
        <Show when={selected}><AmountButton …/></Show>
      </Show>
    </span>}
  </For>
</div>
<SplitButton label="Roll all" …/>
```

The wrapper `span` has `role="presentation"` so the tablist's children are tabs by role. The
arrow-key handler keeps working on the tab buttons through `querySelectorAll("[role=tab]")`. The
`modified` count badge stays inside the tab button. The dice button is shown through CSS on
`[data-selected]`, `:hover` and `:focus-within`, never `display: none` while focused.

### 4.3 `SidePanel`

A `<aside role="complementary" aria-label={title}>` fixed at the right edge from the bottom of the
app bar to the top of the dock, 320 px wide (100 % of the width below 480 px). It has a header with
a forked ribbon title, the header glyph and an X button. Opening moves focus to the header's X (or
to a content element with `data-autofocus`); an effect on close focuses `shell.lastIcon()`. Escape
and outside click are handled by one `keydown` and `pointerdown` listener on `document` that
ignores events inside an open `[role=dialog], [role=alertdialog]` (R5.3).

Slide-in is a 160 ms transform; the `reduceMotion()` helper (`prefers-reduced-motion` or
`settings.pauseMotion`) switches it off.

### 4.4 `Dock`, `ConnectionPill` (R6)

The dock contains the `RuneStone`s, the Velocity and Pitch sliders (the existing slider styling, as
`LiquidBar` where it fits), Play all, Panic and the collapse button. `ConnectionPill` reads
`app.conn.selected()`, `status()` and `message()` exactly as `ConnectBar` does and moves the
Connect, Output select, Test and notices into a `Popover` (`role="dialog"`). The pill text is the
state ("Not connected", "No output", the output name); the dot has `aria-hidden`.

### 4.5 Headings (R8)

`Station` loses `subtitle`; `title` is the heading and is used for the ribbon and the
`aria-label`. `numeral` stays. The old journey names are removed from `JOURNEY`. `JourneyPage`
passes `title={headingOf(s.id, props.voice)}`, the renamed `subtitleOf`, which becomes the only
source for station names:

```ts
export const headingOf = (station, voice) => …   // JourneyPage.tsx; same table and overrides as subtitleOf
```

`model/links.ts` `STATION_NAMES` (a map by station id) becomes `stationName(station, voice)` that
calls the same table, so `targetLabel` takes the voice of the target parameter (it has it:
`PARAMS` entry). The table moves to `model/headings.ts` so that `model/` does not import from
`components/`. `model/caption.ts` builds the path text with `stationName`, and its modulator names
become "LFO" and "Velocity". Badge text in `links.ts` `badgesFor` becomes `LFO<n>` and `VEL<n>`.
`CauldronPage` passes "Effect", "Mix" and "All voices" as titles; cards.tsx passes "LFO of the
voice", "Modulation targets" and "Velocity of the voice".

`host/scripts/gen_web_params.py` writes the labels "LFO to" and "Velocity to"; `params.ts` is
regenerated. The `web_params` ctest compares the generated file with a fresh run, so both change in
one commit. `ParamRow.module.css` badge sizing is checked for the longer text (`LFO1`, `VEL1`).

### 4.6 Styling (R9)

- Buttons share one `.btn` class (border `--line`, radius 0.4em, focus outline as now). Primary
  accents: Roll uses `--voice`, Send uses `--gold`. Split buttons join the two with no inner radius.
- Panel and popover borders use `--line`, titles use the ribbon clip-path (`--ribbon-clip`,
  `--ribbon-pad`) with black text on `--gold`.
- Header glyphs (one per panel) are small SVG functions in `visual/glyphs.ts`, using
  `stroke: var(--gold)`, 1.5 px, same API as the station glyphs; each has a unit test like the
  existing glyph tests (valid SVG, `aria-hidden`, uses only token colours).
- Button icons are in `visual/shellIcons.ts` as plain stroke icons at 16 px.
- `tokens.test.ts` is extended to scan the new CSS modules for colour literals that are not tokens.

## 5. Accessibility details

- App bar: `role="toolbar"` with `aria-label="Sound actions"`; the shield row is a separate
  `tablist`; the dock is `role="group" aria-label="Audition"`.
- Roving focus inside the toolbar is not added; every button is a tab stop, as now.
- The strip is a live region: `role="status"` container always in the DOM (empty when hidden) so
  announcements are not lost; an error switches the message element to `role="alert"`.
- Name field `aria-invalid` and `aria-describedby` point to the hint element; the hint is also the
  text a screen reader gets for the Update state.
- Panels announce by their `aria-label`; icon buttons use `aria-pressed` for open state.

## 6. Tests

| Area | Tests |
|---|---|
| `state/library.test.ts` | unique add and rename (case-insensitive), `replace`, `findByName`, migration cases (R3.3 examples, three-way duplicates, 8-char stem, quota failure), `duplicate` gone |
| `state/saveState.test.ts` | the four kinds, loaded entry with other typed name, dirty and not dirty |
| `state/settings.test.ts` | new fields default, clamp, old stored object loads |
| `state/session.test.ts` | `setName` is no undo step, dirty, autosave, `renameBaseline` |
| `state/importer.test.ts`, `components/importer.test.tsx` | exists note, unticked, replace after one confirm, batch numbering |
| `components/shell.test.tsx` (new) | app bar content and order, menus open and close with keys, Revert menu Initialise is one undo step, Send menu, one panel at a time, Escape order (dialog before panel), focus return, panel contents mount, dock collapse persists, connection popover opens on guarded actions and not on load, strip priority and 5 s timeout with fake timers, dismiss, `role` switch |
| `components/name.test.tsx` (new) | empty name blocked and restored on blur and Escape, count while focused, Enter and Ctrl+S, three Save states, confirmation text, rename dialog rules, strip messages |
| `components/shields.test.tsx` (new) | tab roles only on tab buttons, arrows and Home/End, dice selects and rolls, amounts separate and persisted, Roll all |
| `components/journey.test.tsx`, `cauldron.test.tsx`, `caption.test.tsx`, `threads.test.tsx`, `app.test.tsx` | new headings, voice-dependent cases for snare, cymbal and hi-hat, `aria-label`, caption and target-label texts, `LFO1`/`VEL1` badges |
| `visual/glyphs.test.ts`, `tokens.test.ts` | header glyphs, token-only colours in the new CSS |
| `host/` `web_params` ctest | regenerated `params.ts` matches the generator |

`npm test` and `npm run typecheck` pass after every task. The final task takes headless Chrome
screenshots (1440 x 900 and 390 x 844) of: page with Drum 1, Library panel open, connection popover
open, a running transfer, a collapsed dock, and saves them in the scratch directory for review.

import { createStore, flush } from "solid-js";
import type { Pack, PackFile, Preset, Unreadable } from "../files/pack";
import { scanPack } from "../files/pack";
import { realClock, type Clock } from "../midi/sender";
import type { App } from "./app";
import { isDirty } from "./dirty";

/** A selection is sent only after this long without another one (R3.3). */
export const SEND_DEBOUNCE_MS = 250;
/** How long the hint stays (R2.4). */
export const HINT_MS = 4000;

export interface ImporterState {
  presets: Preset[];
  unreadable: Unreadable[];
  ignored: number;
  /** Preset.key */
  selected: string | null;
  hint: string | null;
  /** Preset.key of the rows ticked for Add to library */
  ticked: string[];
  /** Outcome of the last Add to library */
  result: string | null;
}

export interface Importer {
  readonly state: ImporterState;
  open(files: PackFile[]): Promise<void>;
  /** Returns "confirm" when edits would be lost and `force` is not set; nothing changes then (R2.8). */
  select(key: string, force?: boolean): "ok" | "confirm";
  step(delta: 1 | -1): "ok" | "confirm";
  /** Sends the current values again and shows the hint when the transfer ends (R3.5). */
  sendAgain(): void;
  tick(key: string, on: boolean): void;
  /** Edits the name used when the preset is added to the library (R4.2). */
  rename(key: string, name: string): void;
  /** Adds the ticked presets in list order; stops at the first library error (R4.1). Never touches the session or sender (R4.3). */
  addTicked(): void;
}

/** Never calls `app.store()`: a selection is live only (R2.3). */
export function createImporter(app: App, clock: Clock = realClock): Importer {
  const [state, setState] = createStore<ImporterState>({
    presets: [], unreadable: [], ignored: 0, selected: null, hint: null, ticked: [], result: null,
  });
  let sendTimer: unknown = null;
  let hintTimer: unknown = null;
  /** A transfer started by this importer has not ended yet. */
  let awaiting = false;

  const clearTimers = () => {
    if (sendTimer !== null) clock.clearTimeout(sendTimer);
    if (hintTimer !== null) clock.clearTimeout(hintTimer);
    sendTimer = hintTimer = null;
    awaiting = false;
  };
  const setHint = (text: string | null) => {
    if (hintTimer !== null) clock.clearTimeout(hintTimer);
    hintTimer = null;
    setState((s) => { s.hint = text; });
    if (text !== null) {
      hintTimer = clock.setTimeout(() => {
        hintTimer = null;
        setState((s) => { s.hint = null; });
        flush();
      }, HINT_MS);
    }
  };

  // shortcut: subscribed for the life of the app, never unsubscribed; one importer per page.
  app.sender.onChange(() => {
    if (!awaiting) return;
    const t = app.sender.transfer();
    if (app.cancelled() || t === null) { awaiting = false; return; } // cancelled, or the output went away
    if (t.sent < t.total) return;
    awaiting = false;
    const preset = state.presets.find((p) => p.key === state.selected);
    if (!preset) return;
    const notes = preset.notes.length > 0 ? " See the notes on the row." : "";
    setHint(`${preset.sound.name} sent. Live only, not stored on the module. Arrival cannot be confirmed.${notes}`);
    flush();
  });

  function select(key: string, force = false): "ok" | "confirm" {
    const preset = state.presets.find((p) => p.key === key);
    if (!preset) return "ok";
    if (!force && isDirty(app.session)) return "confirm";
    app.session.load({ name: preset.sound.name, values: preset.sound.values.slice() }, null, { send: false });
    setState((s) => { s.selected = key; });
    if (sendTimer !== null) clock.clearTimeout(sendTimer);
    sendTimer = null;
    awaiting = false;
    if (app.hasOutput()) {
      setHint(null);
      sendTimer = clock.setTimeout(() => {
        sendTimer = null;
        awaiting = true;
        app.sendAll();
      }, SEND_DEBOUNCE_MS);
    } else {
      setHint(`${preset.sound.name} selected. Connect a MIDI output to send it`);
    }
    flush();
    return "ok";
  }

  return {
    state,
    async open(files) {
      const pack: Pack = await scanPack(files);
      clearTimers();
      setState((s) => {
        s.presets = pack.presets;
        s.unreadable = pack.unreadable;
        s.ignored = pack.ignored;
        s.selected = null;
        s.hint = null;
        s.ticked = [];
        s.result = null;
      });
      flush();
    },
    select,
    step(delta) {
      const n = state.presets.length;
      if (n === 0) return "ok";
      const i = state.presets.findIndex((p) => p.key === state.selected);
      const next = i < 0 ? (delta > 0 ? 0 : n - 1) : Math.min(n - 1, Math.max(0, i + delta));
      return select(state.presets[next]!.key);
    },
    sendAgain() {
      if (state.selected === null || !app.hasOutput()) return;
      setHint(null);
      awaiting = true;
      app.sendAll();
      flush();
    },
    tick(key, on) {
      setState((s) => {
        const i = s.ticked.indexOf(key);
        if (on && i < 0) s.ticked.push(key);
        else if (!on && i >= 0) s.ticked.splice(i, 1);
      });
      flush();
    },
    rename(key, name) {
      setState((s) => {
        const p = s.presets.find((x) => x.key === key);
        if (p) p.name = name;
      });
      flush();
    },
    addTicked() {
      const todo = state.presets.filter((p) => state.ticked.includes(p.key));
      let n = 0;
      let error: string | null = null;
      for (const p of todo) {
        const r = app.library.add(p.name, p.sound, []);
        if (!r.ok) { error = r.error; break; }
        n++;
      }
      const added = new Set(todo.slice(0, n).map((p) => p.key));
      setState((s) => {
        s.ticked = s.ticked.filter((k) => !added.has(k));
        s.result = error === null
          ? `Added ${n} ${n === 1 ? "sound" : "sounds"} to the library.`
          : `${error} Added ${n} of ${todo.length}.`;
      });
      flush();
    },
  };
}

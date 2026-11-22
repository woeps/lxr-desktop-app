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
}

export interface Importer {
  readonly state: ImporterState;
  open(files: PackFile[]): Promise<void>;
  /** Returns "confirm" when edits would be lost and `force` is not set; nothing changes then (R2.8). */
  select(key: string, force?: boolean): "ok" | "confirm";
  step(delta: 1 | -1): "ok" | "confirm";
}

/** Never calls `app.store()`: a selection is live only (R2.3). */
export function createImporter(app: App, clock: Clock = realClock): Importer {
  const [state, setState] = createStore<ImporterState>({
    presets: [], unreadable: [], ignored: 0, selected: null, hint: null,
  });
  let sendTimer: unknown = null;
  let hintTimer: unknown = null;

  const clearTimers = () => {
    if (sendTimer !== null) clock.clearTimeout(sendTimer);
    if (hintTimer !== null) clock.clearTimeout(hintTimer);
    sendTimer = hintTimer = null;
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

  function select(key: string, force = false): "ok" | "confirm" {
    const preset = state.presets.find((p) => p.key === key);
    if (!preset) return "ok";
    if (!force && isDirty(app.session)) return "confirm";
    app.session.load({ name: preset.sound.name, values: preset.sound.values.slice() }, null, { send: false });
    setState((s) => { s.selected = key; });
    if (sendTimer !== null) clock.clearTimeout(sendTimer);
    sendTimer = null;
    if (app.hasOutput()) {
      setHint(null);
      sendTimer = clock.setTimeout(() => {
        sendTimer = null;
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
  };
}

import { createContext, createStore, flush, useContext } from "solid-js";
import { PARAMS } from "../generated/params";
import { createHistory, type History } from "../model/history";
import { VALUES_LENGTH } from "../model/params";
import { clamp, diff, factory, type Change, type Sound, type VoiceClip } from "../model/sound";
import type { Clock, Sender } from "../midi/sender";

export const SESSION_KEY = "lxr.session.v1";
export const AUTOSAVE_MS = 500;

export type Page = 0 | 1 | 2 | 3 | 4 | 5 | "cauldron";
export type PickMode = "target_lfo" | "vel_dest" | null;

export interface SessionState {
  current: Sound;
  baseline: Sound;
  libraryId: string | null;
  abSnapshot: Sound | null;
  locked: number[];
  moduleInSync: boolean;
  copyBuffer: VoiceClip | null;
  page: Page;
  pick: PickMode;
}

export interface SessionDeps {
  storage: Storage;
  clock: Clock;
  sender: SenderPart;
  /** True while an output is chosen and present. Without one, edits mark the module out of sync. */
  hasOutput: () => boolean;
  history?: History;
}
type SenderPart = Pick<Sender, "setParam" | "sendTransfer">;

export interface Session {
  /** Reactive values; Solid 2 batches writes, so every action below flushes before it returns. */
  readonly state: SessionState;
  readonly history: History;
  /**
   * The one function that changes `current` (design 4.5): values are clamped, history gets one step
   * unless `replay`, and changed ids go to the sender unless `send` is false.
   */
  applyChanges(changes: readonly Change[], opts?: { send?: boolean; replay?: boolean }): void;
  undo(): void;
  redo(): void;
  /** Make `sound` current and baseline as one undo step, and send it in full (R3.9, R5.6). */
  load(sound: Sound, libraryId?: string | null, opts?: { send?: boolean }): void;
  /** Current becomes the baseline, after a save to the library (R3.6). */
  markSaved(libraryId?: string | null): void;
  /** Rename the current sound: no undo step, nothing sent, the sound turns dirty (R2.12). */
  setName(name: string): void;
  /** Rename the baseline only, so a library rename alone leaves the sound clean (R2.8). */
  renameBaseline(name: string): void;
  /** Restore the sound as last loaded or saved, as one step (R5.3). */
  revert(): void;
  /** First press takes the snapshot, later presses swap it with current (R5.2). */
  toggleAB(): void;
  setPage(page: Page): void;
  setPick(pick: PickMode): void;
  toggleLock(id: number): void;
  setCopyBuffer(clip: VoiceClip | null): void;
  setModuleInSync(v: boolean): void;
  /** Write the autosave now (also on pagehide). */
  flushSave(): void;
}

const copySound = (s: Sound): Sound => ({ name: s.name, values: new Uint8Array(s.values) });

function parseSound(raw: unknown): Sound | null {
  const o = raw as { name?: unknown; values?: unknown } | null;
  if (!o || typeof o.name !== "string" || !Array.isArray(o.values) || o.values.length !== VALUES_LENGTH) return null;
  const values = new Uint8Array(VALUES_LENGTH);
  for (const p of PARAMS) {
    const v = o.values[p.id];
    if (typeof v !== "number") return null;
    values[p.id] = clamp(p.id, v);
  }
  return { name: o.name, values };
}

/** Saved session, or null when absent, corrupt or of another version. */
function restore(storage: Storage): { current: Sound; baseline: Sound; abSnapshot: Sound | null; libraryId: string | null } | null {
  try {
    const o = JSON.parse(storage.getItem(SESSION_KEY) ?? "null");
    if (!o || o.version !== 1) return null;
    const current = parseSound(o.current);
    if (!current) return null;
    return {
      current,
      baseline: parseSound(o.baseline) ?? copySound(current),
      abSnapshot: o.abSnapshot == null ? null : parseSound(o.abSnapshot),
      libraryId: typeof o.libraryId === "string" ? o.libraryId : null,
    };
  } catch {
    return null;
  }
}

const dump = (s: Sound) => ({ name: s.name, values: Array.from(s.values) });

export function createSession(deps: SessionDeps): Session {
  const { storage, clock, sender, hasOutput } = deps;
  const history = deps.history ?? createHistory();
  const saved = restore(storage);
  const init = factory();
  const [state, setState] = createStore<SessionState>({
    current: saved?.current ?? init,
    baseline: saved?.baseline ?? copySound(init),
    libraryId: saved?.libraryId ?? null,
    abSnapshot: saved?.abSnapshot ?? null,
    locked: [],
    moduleInSync: false,
    copyBuffer: null,
    page: 0,
    pick: null,
  });
  let timer: unknown = null;

  function save(): void {
    if (timer !== null) { clock.clearTimeout(timer); timer = null; }
    try {
      storage.setItem(SESSION_KEY, JSON.stringify({
        version: 1,
        current: dump(state.current),
        baseline: dump(state.baseline),
        abSnapshot: state.abSnapshot ? dump(state.abSnapshot) : null,
        libraryId: state.libraryId,
      }));
    } catch { /* quota: the reload just loses the autosave */ }
  }
  function scheduleSave(): void {
    if (timer !== null) clock.clearTimeout(timer);
    timer = clock.setTimeout(save, AUTOSAVE_MS);
  }

  /** Swap in new values for `current` and keep the store consistent. */
  function write(changes: readonly Change[], send: boolean): void {
    const values = new Uint8Array(state.current.values);
    for (const [id, , after] of changes) values[id] = clamp(id, after);
    const name = state.current.name;
    setState((s) => { s.current = { name, values }; });
    if (send) {
      if (hasOutput()) for (const [id] of changes) sender.setParam(id, values[id]!);
      else setState((s) => { s.moduleInSync = false; });
    }
    flush();
    scheduleSave();
  }

  /** Changes that turn current into `target`. */
  const toward = (target: Sound): Change[] =>
    diff(state.current, target).map((id) => [id, state.current.values[id]!, target.values[id]!]);

  function applyChanges(changes: readonly Change[], opts: { send?: boolean; replay?: boolean } = {}): void {
    const real = changes
      .map(([id, , after]): Change => [id, state.current.values[id]!, clamp(id, after)])
      .filter(([, b, a]) => b !== a);
    if (real.length === 0) return;
    if (!opts.replay) history.push(real);
    write(real, opts.send !== false);
  }

  function replay(step: Change[] | null): void {
    if (step) applyChanges(step, { replay: true });
  }

  return {
    state,
    history,
    applyChanges,
    undo: () => replay(history.undo()),
    redo: () => replay(history.redo()),
    load(sound, libraryId = null, opts) {
      const target = copySound(sound);
      const changes = toward(target);
      if (changes.length > 0) history.push(changes);
      setState((s) => {
        s.current = copySound(target);
        s.baseline = copySound(target);
        s.libraryId = libraryId;
      });
      if (opts?.send !== false && hasOutput()) sender.sendTransfer(target.values);
      else setState((s) => { s.moduleInSync = false; });
      flush();
      scheduleSave();
    },
    markSaved(libraryId) {
      setState((s) => {
        s.baseline = copySound(state.current);
        if (libraryId !== undefined) s.libraryId = libraryId;
      });
      flush();
      scheduleSave();
    },
    setName(name) {
      setState((s) => { s.current = { name, values: s.current.values }; });
      flush();
      scheduleSave();
    },
    renameBaseline(name) {
      setState((s) => { s.baseline = { name, values: s.baseline.values }; });
      flush();
      scheduleSave();
    },
    revert() { applyChanges(toward(state.baseline)); },
    toggleAB() {
      const held = state.abSnapshot;
      const now = copySound(state.current);
      if (!held) {
        setState((s) => { s.abSnapshot = now; });
        flush();
        scheduleSave();
        return;
      }
      applyChanges(toward(held));
      setState((s) => { s.abSnapshot = now; });
      flush();
    },
    setPage(page) { setState((s) => { s.page = page; }); flush(); },
    setPick(pick) { setState((s) => { s.pick = pick; }); flush(); },
    toggleLock(id) {
      setState((s) => { s.locked = state.locked.includes(id) ? state.locked.filter((x) => x !== id) : [...state.locked, id]; });
      flush();
    },
    setCopyBuffer(clip) { setState((s) => { s.copyBuffer = clip; }); flush(); },
    setModuleInSync(v) { setState((s) => { s.moduleInSync = v; }); flush(); },
    flushSave: save,
  };
}

export const SessionContext = createContext<Session>();

/** The session provided by App.tsx; throws when used outside the provider. */
export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionContext");
  return s;
}

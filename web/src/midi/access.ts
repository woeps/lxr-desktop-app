import { encodeNote, NOTE_OFF_DELAY_MS, type MidiSetup } from "./encode";
import type { Clock, Output } from "./sender";

/** localStorage key shared with state/settings.ts (design 4.6). This module only touches the `output` field. */
export const SETTINGS_KEY = "lxr.settings.v1";

export const MSG_INSECURE =
  "Web MIDI is only available on https:// pages and on localhost. Open this page from localhost or an HTTPS host (file:// does not work).";
export const MSG_UNSUPPORTED =
  "This browser does not support Web MIDI. Use Chrome, Edge or Opera. Editing, the library and file export still work.";
export const MSG_DENIED =
  "MIDI access denied. Allow MIDI for this site in the browser's site settings (the lock icon in the address bar), then press Connect again. Editing, the library and file export still work.";
export const MSG_DISCONNECTED = "Disconnected";

export interface OutputInfo { id: string; name: string }

export type AccessStatus = "idle" | "insecure" | "unsupported" | "denied" | "ready";

/** The slice of the Web MIDI API used here. */
export interface MidiPortLike extends OutputInfo { send(data: number[], timestamp?: number): void }
export interface MidiAccessLike {
  outputs: { values(): Iterable<MidiPortLike> };
  onstatechange: ((e: unknown) => void) | null;
}
export interface MidiEnv {
  isSecureContext: boolean;
  requestMIDIAccess?: (opts: { sysex: boolean }) => Promise<MidiAccessLike>;
}

export interface MidiConnection {
  status(): AccessStatus;
  /** Message for insecure, unsupported or denied; "Disconnected" when the saved output is missing; else null. */
  message(): string | null;
  outputs(): OutputInfo[];
  /** The chosen output, or null (nothing chosen, or the saved one is absent). */
  selected(): OutputInfo | null;
  /** The saved choice, kept while that output is absent so it is picked again when it returns (R1.3). */
  saved(): OutputInfo | null;
  /** Output for the sender, null while none is chosen and present. */
  output(): Output | null;
  connect(): Promise<void>;
  select(id: string | null): void;
  /** Note on now and note off NOTE_OFF_DELAY_MS later, on drum 1 (R1.4). False when nothing was sent. */
  testNote(): boolean;
  /** Called whenever anything above may have changed. Returns unsubscribe. */
  onChange(fn: () => void): () => void;
}

function readSaved(storage: Storage): OutputInfo | null {
  try {
    const o = (JSON.parse(storage.getItem(SETTINGS_KEY) ?? "{}") as { output?: Partial<OutputInfo> }).output;
    return o && typeof o.id === "string" && typeof o.name === "string" ? { id: o.id, name: o.name } : null;
  } catch {
    return null;
  }
}

function writeSaved(storage: Storage, o: OutputInfo | null): void {
  let obj: Record<string, unknown> = {};
  try {
    const p = JSON.parse(storage.getItem(SETTINGS_KEY) ?? "{}");
    if (p && typeof p === "object" && !Array.isArray(p)) obj = p;
  } catch { /* corrupt settings are replaced */ }
  if (o) obj.output = o; else delete obj.output;
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(obj)); } catch { /* quota: the choice just is not remembered */ }
}

/**
 * Web MIDI access (design 4.6). Environment, storage and clock are injected; the page passes
 * `window`/`navigator`, `localStorage` and a performance.now clock.
 * Rule: a saved output that is absent is not replaced by another one (a wrong device must not get
 * notes); with no saved choice the first output is chosen.
 */
export function createMidiConnection(
  env: MidiEnv, storage: Storage, clock: Clock, getSetup: () => MidiSetup,
): MidiConnection {
  let status: AccessStatus = "idle";
  let access: MidiAccessLike | null = null;
  let ports: MidiPortLike[] = [];
  let saved = readSaved(storage);
  let chosen: MidiPortLike | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((f) => f());

  /** Recompute the list and the chosen port after connect or a statechange. */
  function refresh() {
    ports = access ? [...access.outputs.values()] : [];
    if (saved) chosen = ports.find((p) => p.id === saved!.id) ?? null;
    else chosen = ports[0] ?? null;
    if (!saved && chosen) { saved = { id: chosen.id, name: chosen.name }; writeSaved(storage, saved); }
    emit();
  }

  return {
    status: () => status,
    message: () =>
      status === "insecure" ? MSG_INSECURE
      : status === "unsupported" ? MSG_UNSUPPORTED
      : status === "denied" ? MSG_DENIED
      : status === "ready" && saved && !chosen ? MSG_DISCONNECTED
      : null,
    outputs: () => ports.map((p) => ({ id: p.id, name: p.name })),
    selected: () => (chosen ? { id: chosen.id, name: chosen.name } : null),
    saved: () => saved,
    output: () => {
      const p = chosen;
      return p ? { send: (bytes, t) => p.send([...bytes], t) } : null;
    },
    async connect() {
      if (!env.isSecureContext) { status = "insecure"; emit(); return; }
      if (typeof env.requestMIDIAccess !== "function") { status = "unsupported"; emit(); return; }
      try {
        access = await env.requestMIDIAccess({ sysex: false });
      } catch {
        status = "denied"; access = null; ports = []; chosen = null; emit(); return;
      }
      status = "ready";
      access.onstatechange = () => refresh();
      refresh();
    },
    select(id) {
      const p = id === null ? null : ports.find((x) => x.id === id) ?? null;
      if (id !== null && !p) return;
      chosen = p;
      saved = p ? { id: p.id, name: p.name } : null;
      writeSaved(storage, saved);
      emit();
    },
    testNote() {
      if (!chosen) return false;
      const n = encodeNote(getSetup(), 0, 100);
      const t = clock.now();
      chosen.send([...n.on], t);
      chosen.send([...n.off], t + NOTE_OFF_DELAY_MS);
      return true;
    },
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

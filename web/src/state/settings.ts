import { createStore, flush } from "solid-js";
import { MIDI_SETTINGS } from "../generated/params";
import { DEFAULT_PITCH, type MidiSetup } from "../midi/encode";
import { SETTINGS_KEY } from "../midi/access";

/** Voice slots: drum 1..3, snare, cymbal, closed hi-hat, open hi-hat (R2). */
export const SLOTS = 7;
/** Keys for slots 1..7 and Play all (R4.3, design 4.9). */
export const DEFAULT_KEYS: readonly string[] = ["1", "2", "3", "4", "5", "6", "7", "0"];
export const DEFAULT_VELOCITY = 100;
export const DEFAULT_ROLL = 50;

/** Browser-side settings (design 4.5, 4.9). The module MIDI setup is not sent to the module (R2.3). */
export interface Settings {
  /** midi_chan_1..7, 1..16 */
  channels: number[];
  /** midi_chan_global, 0 = off, 1..16 */
  global: number;
  /** midi_note1..7, 0 = any note */
  notes: number[];
  /** Keys for the seven voice slots, then Play all; single characters, all different. */
  keys: string[];
  /** 1..127 (R4.2) */
  velocity: number;
  /** 0..127, sent to voices that accept any note (R4.2) */
  pitch: number;
  pauseMotion: boolean;
  /** Strike the current voice when a transfer completes (R6.4). */
  auditionAfterSend: boolean;
  /** Amount of the voice dice buttons, 0..100 percent (R4.5). */
  rollVoice: number;
  /** Amount of Roll all, 0..100 percent (R4.5). */
  rollAll: number;
  /** The audition dock shows only its thin strip (R6.5). */
  dockCollapsed: boolean;
}

const def = (name: string): number => MIDI_SETTINGS.find((s) => s.name === name)!.def;

export function defaultSettings(): Settings {
  return {
    channels: Array.from({ length: SLOTS }, (_, i) => def(`midi_chan_${i + 1}`)),
    global: def("midi_chan_global"),
    notes: Array.from({ length: SLOTS }, (_, i) => def(`midi_note${i + 1}`)),
    keys: [...DEFAULT_KEYS],
    velocity: DEFAULT_VELOCITY,
    pitch: DEFAULT_PITCH,
    pauseMotion: false,
    auditionAfterSend: false,
    rollVoice: DEFAULT_ROLL,
    rollAll: DEFAULT_ROLL,
    dockCollapsed: false,
  };
}

const int = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;

/** A finite number is rounded and clamped into min..max; anything else gives the fallback. */
const clamped = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

const intList = (v: unknown, n: number, min: number, max: number, fallback: number[]): number[] =>
  Array.isArray(v) && v.length === n ? v.map((x, i) => int(x, min, max, fallback[i]!)) : [...fallback];

/** Keep what is valid, fall back per field to the default for the rest. */
export function sanitize(raw: unknown): Settings {
  const d = defaultSettings();
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const keys = Array.isArray(o.keys) && o.keys.length === d.keys.length
    && o.keys.every((k) => typeof k === "string" && k.length === 1)
    && new Set(o.keys).size === d.keys.length
    ? (o.keys as string[]) : d.keys;
  return {
    channels: intList(o.channels, SLOTS, 1, 16, d.channels),
    global: int(o.global, 0, 16, d.global),
    notes: intList(o.notes, SLOTS, 0, 127, d.notes),
    keys: [...keys],
    velocity: int(o.velocity, 1, 127, d.velocity),
    pitch: int(o.pitch, 0, 127, d.pitch),
    pauseMotion: typeof o.pauseMotion === "boolean" ? o.pauseMotion : d.pauseMotion,
    auditionAfterSend: typeof o.auditionAfterSend === "boolean" ? o.auditionAfterSend : d.auditionAfterSend,
    rollVoice: clamped(o.rollVoice, 0, 100, d.rollVoice),
    rollAll: clamped(o.rollAll, 0, 100, d.rollAll),
    dockCollapsed: typeof o.dockCollapsed === "boolean" ? o.dockCollapsed : d.dockCollapsed,
  };
}

function readStored(storage: Storage): Record<string, unknown> {
  try {
    const p = JSON.parse(storage.getItem(SETTINGS_KEY) ?? "{}");
    return p && typeof p === "object" && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

export interface SettingsStore {
  /** Reactive values. Writes are batched by Solid 2; the actions below flush. */
  readonly state: Settings;
  /** Plain snapshot of the module setup in the shape the encoder takes. */
  midiSetup(): MidiSetup;
  /** Merge a patch (invalid fields fall back to the current value), then save. */
  set(patch: Partial<Settings>): void;
  reset(): void;
}

/**
 * Settings in `lxr.settings.v1`, the object midi/access.ts also writes its `output` field to.
 * Saving merges into the stored object, so `output` (and unknown fields) survive; stored JSON that
 * is corrupt or has bad fields gives defaults for those fields.
 */
export function createSettings(storage: Storage): SettingsStore {
  const [state, setState] = createStore<Settings>(sanitize(readStored(storage)));

  const snapshot = (): Settings => ({
    channels: [...state.channels], global: state.global, notes: [...state.notes], keys: [...state.keys],
    velocity: state.velocity, pitch: state.pitch, pauseMotion: state.pauseMotion, auditionAfterSend: state.auditionAfterSend,
    rollVoice: state.rollVoice, rollAll: state.rollAll, dockCollapsed: state.dockCollapsed,
  });

  function commit(next: Settings): void {
    setState((s) => { Object.assign(s, next); });
    flush();
    try { storage.setItem(SETTINGS_KEY, JSON.stringify({ ...readStored(storage), ...next })); } catch { /* quota: not remembered */ }
  }

  return {
    state,
    midiSetup: () => ({ channels: [...state.channels], global: state.global, notes: [...state.notes] }),
    set: (patch) => commit(sanitize({ ...snapshot(), ...patch })),
    reset: () => commit(defaultSettings()),
  };
}

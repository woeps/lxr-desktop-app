import { OUTPUT_CHOICES, STORE, type ParamDef } from "../generated/params";

/** The page's MIDI setup (R2): channels 1..16, global 0 = off, trigger notes 0 = any. Index 0..6 = voice slot. */
export interface MidiSetup {
  /** midi_chan_1..7 */
  channels: readonly number[];
  /** midi_chan_global (0 = off) */
  global: number;
  /** midi_note1..7 (0 = any note) */
  notes: readonly number[];
}

export type Bytes = readonly number[];

/** Default pitch sent to a voice that accepts any note (R4.1). */
export const DEFAULT_PITCH = 60;

/** Delay between note on and note off (design 4.6). */
export const NOTE_OFF_DELAY_MS = 100;

const data7 = (v: number): number => Math.min(127, Math.max(0, Math.round(v)));

/**
 * 0-based MIDI channel for a parameter (R2.1, design 4.6): voice 0..5 uses its own channel;
 * global parameters and every NRPN use the global channel when set, else drum 1's channel.
 */
export function channelFor(setup: MidiSetup, p: ParamDef): number {
  const shared = "nrpn" in p.addr || p.voice < 0;
  const ch = shared ? setup.global || setup.channels[0]! : setup.channels[p.voice]!;
  return (ch - 1) & 0x0f;
}

/** CC parameter: one message. NRPN parameter: CC 99, 98 and 6, so the module's latched NRPN never matters. */
export function encodeParam(setup: MidiSetup, p: ParamDef, value: number): Bytes {
  const cc = 0xb0 | channelFor(setup, p);
  const v = data7(value);
  if ("cc" in p.addr) return [cc, p.addr.cc, v];
  const n = p.addr.nrpn;
  return [cc, 99, n >> 7, cc, 98, n & 0x7f, cc, 6, v];
}

/** Value to send for an output choice label; aliases (St2, L2, R2) are never produced by the page. */
export function outputValue(label: "main" | "left" | "right" | "FX"): number {
  return OUTPUT_CHOICES.find((c) => c.label === label)!.value;
}

/** Note the voice (0..6) gets: its trigger note when set, else the pitch control. */
export function noteFor(setup: MidiSetup, voice: number, pitch: number = DEFAULT_PITCH): number {
  return setup.notes[voice] || pitch;
}

/** Note on for a voice; `off` is sent NOTE_OFF_DELAY_MS later. */
export function encodeNote(setup: MidiSetup, voice: number, velocity: number, pitch: number = DEFAULT_PITCH) {
  const channel = (setup.channels[voice]! - 1) & 0x0f;
  const note = noteFor(setup, voice, pitch);
  return {
    channel,
    note,
    on: [0x90 | channel, note, data7(velocity)] as Bytes,
    off: [0x80 | channel, note, 0] as Bytes,
  };
}

/** Store to boot slot (design 3.1): NRPN 16128 = 0x53, then NRPN null, on drum 1's channel. */
export function encodeStore(setup: MidiSetup): Bytes {
  const cc = 0xb0 | ((setup.channels[0]! - 1) & 0x0f);
  const n = STORE.nrpn;
  const z = STORE.nullNrpn;
  return [cc, 99, n >> 7, cc, 98, n & 0x7f, cc, 6, STORE.key, cc, 99, z >> 7, cc, 98, z & 0x7f];
}

/**
 * Panic (R4.5): a note off for each (channel, note) the page sent a note on for and not yet released.
 * No CC 120 or 123: the module reads them as parameters 119 and 122.
 */
export function encodePanic(held: Iterable<{ channel: number; note: number }>): Bytes[] {
  return [...held].map((h) => [0x80 | h.channel, h.note, 0]);
}

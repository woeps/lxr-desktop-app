import { PARAMS, type ParamDef } from "../generated/params";
import { VALUES_LENGTH, paramById, paramsOfVoice } from "./params";

export type Values = Uint8Array;
export interface Sound { name: string; values: Values }
/** One change: [parameter id, value before, value after]. */
export type Change = [id: number, before: number, after: number];
/** Source of uniform numbers in [0, 1), like Math.random. */
export type Rng = () => number;
/** Values of one voice by slotKey, as copied. */
export type VoiceClip = Map<string, number>;

/** Every PARAMS id at its default (equals the firmware factory sound). */
export function factory(name = "Init"): Sound {
  const values = new Uint8Array(VALUES_LENGTH);
  for (const p of PARAMS) values[p.id] = p.def;
  return { name, values };
}

/** Clamp into the parameter's min..max (integer; NaN gives min). Unknown id throws. */
export function clamp(id: number, v: number): number {
  const p = paramById(id);
  if (!p) throw new RangeError(`unknown parameter id ${id}`);
  if (Number.isNaN(v)) return p.min;
  return Math.min(p.max, Math.max(p.min, Math.round(v)));
}

/** Ids (PARAMS only, ascending) whose values differ between a and b. */
export function diff(a: Sound, b: Sound): number[] {
  return PARAMS.filter((p) => a.values[p.id] !== b.values[p.id]).map((p) => p.id);
}

/** Write changes into the sound (the "after" values). */
export function applyChanges(sound: Sound, changes: readonly Change[]): void {
  for (const [id, , after] of changes) sound.values[id] = after;
}

/** Copy the values of one voice, keyed by slotKey. */
export function copyVoice(src: Sound, voice: ParamDef["voice"]): VoiceClip {
  const clip: VoiceClip = new Map();
  for (const p of paramsOfVoice(voice)) clip.set(p.slotKey, src.values[p.id]);
  return clip;
}

/**
 * Paste a clip onto a voice, matching by slotKey. Locked ids and slotKeys the target
 * voice lacks are skipped. Returns the changes (only ids that actually change); the
 * sound is not modified.
 */
export function pasteVoice(
  dst: Sound,
  voice: ParamDef["voice"],
  clip: VoiceClip,
  locked: ReadonlySet<number> = new Set(),
): Change[] {
  const changes: Change[] = [];
  for (const p of paramsOfVoice(voice)) {
    const v = clip.get(p.slotKey);
    if (v === undefined || locked.has(p.id)) continue;
    const after = clamp(p.id, v);
    const before = dst.values[p.id];
    if (after !== before) changes.push([p.id, before, after]);
  }
  return changes;
}

/**
 * Randomise one voice. For each unlocked, non-mix, non-inert parameter: numeric
 * v + round((u - v) * amount) with u uniform in min..max; enum: with probability
 * amount, a uniform value. amount is clamped to 0..1. Returns the changes; the sound
 * is not modified. Draws exactly two rng values per eligible parameter.
 */
export function randomise(
  sound: Sound,
  voice: ParamDef["voice"],
  amount: number,
  locked: ReadonlySet<number>,
  rng: Rng,
): Change[] {
  const a = Number.isNaN(amount) ? 0 : Math.min(1, Math.max(0, amount));
  const changes: Change[] = [];
  for (const p of paramsOfVoice(voice)) {
    if (p.mix || p.inert || locked.has(p.id)) continue;
    const r1 = rng();
    const r2 = rng();
    const before = sound.values[p.id];
    const u = p.min + Math.floor(r1 * (p.max - p.min + 1));
    let after: number;
    if (p.kind === "enum") after = r2 < a ? u : before;
    else after = before + Math.round((u - before) * a);
    after = clamp(p.id, after);
    if (after !== before) changes.push([p.id, before, after]);
  }
  return changes;
}

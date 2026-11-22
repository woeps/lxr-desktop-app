import { MOD_TARGETS, PARAMS, type Station } from "../generated/params";
import { paramById, type ParamDef } from "./params";
import type { Values } from "./sound";

/** Mentor = the voice's LFO, Oracle = its velocity link (design 4.12.8). */
export type ModKind = "mentor" | "oracle";
export type Voice = 0 | 1 | 2 | 3 | 4 | 5;

/** One modulator of the kit and the parameter it acts on (null = none or a target without a public id). */
export interface Binding { kind: ModKind; voice: Voice; target: number | null }
/** A badge on a row: `M<n>` or `O<n>` with n = voice + 1; own = the modulator belongs to the row's voice. */
export interface Badge { text: string; kind: ModKind; voice: Voice; own: boolean }

export const VOICE_NAMES = ["Drum 1", "Drum 2", "Drum 3", "Snare", "Cymbal", "Hi-hat"] as const;
export const STATION_TITLES: Record<Station, string> = {
  call: "The Call", hero: "The Hero", threshold: "The Threshold", trials: "Road of Trials",
  ordeal: "The Ordeal", forge: "The Forge", roadBack: "The Road Back",
  mentor: "Mentor", bindings: "Bindings", oracle: "Oracle",
  brew: "The Brew", pour: "The Pour", millstone: "The Millstone",
};

const VOICES: readonly Voice[] = [0, 1, 2, 3, 4, 5];
const idOf = (name: string) => PARAMS.find((p) => p.name === name)!.id;
const LFO_IDS = VOICES.map((v) => idOf(`target_lfo${v + 1}`));
const VEL_IDS = VOICES.map((v) => idOf(`vel_dest_${v + 1}`));

/** Parameter id behind a stored target index, or null for none, unknown or non-public targets. */
export function targetId(index: number): number | null {
  return MOD_TARGETS[index] ?? null;
}

/** Stored target index of a parameter id (first match), or 0 ("none") when it cannot be a target. */
export function targetIndex(id: number): number {
  const i = MOD_TARGETS.indexOf(id);
  return i < 0 ? 0 : i;
}

/** The twelve bindings of a sound: Mentor then Oracle for voices 0..5. */
export function bindings(values: Values): Binding[] {
  return VOICES.flatMap((voice) => [
    { kind: "mentor" as const, voice, target: targetId(values[LFO_IDS[voice]]) },
    { kind: "oracle" as const, voice, target: targetId(values[VEL_IDS[voice]]) },
  ]);
}

/** Bindings that act on one parameter. */
export function bindingsOn(all: readonly Binding[], id: number): Binding[] {
  return all.filter((b) => b.target === id);
}

/** Badges of a row, own modulators first. */
export function badgesFor(all: readonly Binding[], id: number, rowVoice: ParamDef["voice"]): Badge[] {
  return bindingsOn(all, id)
    .map((b) => ({ text: `${b.kind === "mentor" ? "M" : "O"}${b.voice + 1}`, kind: b.kind, voice: b.voice, own: b.voice === rowVoice }))
    .sort((a, b) => Number(b.own) - Number(a.own));
}

/** Two or more modulators on one parameter: the one that updates last wins in the firmware. */
export function isContested(all: readonly Binding[], id: number): boolean {
  return bindingsOn(all, id).length > 1;
}

/** Parameter ids with two or more modulators. */
export function contestedIds(all: readonly Binding[]): Set<number> {
  const seen = new Set<number>();
  const out = new Set<number>();
  for (const b of all) {
    if (b.target === null) continue;
    if (seen.has(b.target)) out.add(b.target);
    seen.add(b.target);
  }
  return out;
}

/** Modulators of other voices whose target lies on this voice (the read-only incoming list). */
export function incoming(all: readonly Binding[], voice: Voice): Binding[] {
  return all.filter((b) => b.target !== null && b.voice !== voice && paramById(b.target)?.voice === voice);
}

/** "voice › station › label", for example "Drum 1 › The Forge › cutoff"; "none" for no target. */
export function targetLabel(id: number | null): string {
  const p = id === null ? undefined : paramById(id);
  if (!p) return "none";
  const voice = p.voice === -1 ? "Cauldron" : VOICE_NAMES[p.voice];
  return `${voice} › ${STATION_TITLES[p.station]} › ${p.label}`;
}

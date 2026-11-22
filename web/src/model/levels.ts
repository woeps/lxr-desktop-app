/**
 * Signal level estimate along the journey (design 4.12.7). Pure functions on
 * normalised inputs (0..1). Out-of-range or non-finite inputs are clamped to 0..1
 * first; the result of each bridge is clamped to 0.06..1.
 */

export type FilterKind = "lp" | "lp2" | "hp" | "off" | "other";

export interface LevelInput {
  /** FM amount, 0..1. */
  fm: number;
  filter: FilterKind;
  /** Filter cutoff, 0..1. */
  cutoff: number;
  /** Strike glow of the amp envelope, 0..1 (raised to at least 0.25). */
  amp: number;
  /** Drive, 0..1. */
  drive: number;
  /** Voice volume, 0..1. */
  volume: number;
}

export const LEVEL_FLOOR = 0.06;

const unit = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const bridge = (x: number): number => Math.min(1, Math.max(LEVEL_FLOOR, x));

/** Filter pass fp (unclamped by the bridge floor). */
export function filterPass(filter: FilterKind, cutoff: number): number {
  const c = unit(cutoff);
  switch (filter) {
    case "lp":
    case "lp2": return 0.15 + 0.85 * c;
    case "hp": return 0.15 + 0.85 * (1 - c);
    case "off": return 1;
    default: return 0.6;
  }
}

/** Levels L0..L6, one per bridge. */
export function levels(i: LevelInput): number[] {
  const fp = filterPass(i.filter, i.cutoff);
  const l4 = fp * Math.max(0.25, unit(i.amp));
  const l5 = Math.min(1, l4 * (1 + 0.4 * unit(i.drive)));
  const l6 = l5 * unit(i.volume);
  return [unit(i.fm), 1, 1, fp, l4, l5, l6].map(bridge);
}

/** Bridge opacity: max(0.35, L). */
export const bridgeOpacity = (l: number): number => Math.max(0.35, l);

/** Spark size: 2 + 2.5·L. */
export const sparkSize = (l: number): number => 2 + 2.5 * l;

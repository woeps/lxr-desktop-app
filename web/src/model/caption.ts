import type { ParamDef } from "../generated/params";
import { badgesFor, bindings, contestedIds, targetLabel, type ModKind } from "./links";
import { headingOf, type Voice } from "./headings";
import { paramById } from "./params";
import type { Values } from "./sound";

/** Stations of the signal path, in order; bridge i joins path[i] and path[i + 1] (design 4.12.7). */
export const SIGNAL_PATH = ["call", "hero", "threshold", "trials", "ordeal", "forge", "roadBack", "return"] as const;

/** What pointing at or focusing a row lights up (design 4.12.9). */
export interface Hot {
  caption: string;
  /** First lit bridge: bridges from..6 are lit; null = none. */
  from: number | null;
  /** Light the fall arc. */
  fall: boolean;
  /** Light the thread of this modulator of the page's voice. */
  thread: ModKind | null;
}

const FALL_ICONS = ["dt", "da", "dc"];
/** Fall rows: fall time, depth and curve of the Threshold. */
export const isFallRow = (d: ParamDef): boolean => d.station === "threshold" && FALL_ICONS.includes(d.icon);

const NONE: Hot = { caption: "", from: null, fall: false, thread: null };
const CONTESTED = " Contested: the one that updates last wins.";

const pathIndex = (station: string): number => (SIGNAL_PATH as readonly string[]).indexOf(station);
const pathText = (from: number, voice: Voice): string => SIGNAL_PATH.slice(from).map((s) => headingOf(s, voice)).join(" → ");

/** Modulation kind an LFO, Velocity or Bindings row stands for, or null for other rows. */
function modKindOf(d: ParamDef): ModKind | null {
  if (d.station === "mentor") return "mentor";
  if (d.station === "oracle") return "oracle";
  if (d.station === "bindings") return d.name.startsWith("vel_dest") ? "oracle" : d.name.startsWith("target_lfo") ? "mentor" : null;
  return null;
}

/** Caption and highlights for a row (design 4.12.9). */
export function hotFor(def: ParamDef, values: Values): Hot {
  const all = bindings(values);
  const kind = modKindOf(def);
  if (kind) {
    const b = all.find((x) => x.kind === kind && x.voice === def.voice);
    const name = kind === "mentor" ? "LFO" : "Velocity";
    const t = b?.target == null ? undefined : paramById(b.target);
    if (!t) return { ...NONE, caption: `${name} acts on nothing yet.` };
    if (t.voice !== def.voice) return { ...NONE, caption: `${name} acts on ${targetLabel(t.id)}, set on that page.` };
    const from = pathIndex(t.station);
    const caption = `${name} moves ${t.label} in ${headingOf(t.station, t.voice)}` + (from >= 0 ? `, which shapes ${pathText(from, t.voice)}` : "") + ".";
    return { caption: caption + (contestedIds(all).has(t.id) ? CONTESTED : ""), from: from >= 0 ? from : null, fall: false, thread: kind };
  }
  const fall = isFallRow(def);
  const from = fall ? 1 : pathIndex(def.station);
  const by = badgesFor(all, def.id, def.voice).map((b) => b.text);
  let caption = from < 0 ? `${def.label}.` : `${def.label} ${fall ? "bends" : "shapes"} ${pathText(from, def.voice)}.`;
  if (by.length) caption += ` Moved by ${by.join(", ")}.`;
  if (by.length > 1) caption += CONTESTED;
  return { caption, from: from >= 0 ? from : null, fall, thread: null };
}

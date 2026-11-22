import type { ParamDef } from "./params";
import { PARAMS, type Station } from "../generated/params";

/** Boxes of a voice page, top to bottom (design 4.12.3). "Return" shows no parameter. */
export const VOICE_STATIONS: readonly Station[] = [
  "call", "hero", "threshold", "trials", "ordeal", "forge", "roadBack", "mentor", "bindings", "oracle",
];
/** Boxes of the Cauldron page (FX bus, voice -1). */
export const CAULDRON_STATIONS: readonly Station[] = ["brew", "pour", "millstone"];

/** Parameters that are never shown (description says "no effect"): voice_lfoN, fx_reverb_type. */
export function hiddenParams(): ParamDef[] {
  return PARAMS.filter((p) => p.inert);
}

/** Rows of one box of one voice, in display order, without hidden parameters. */
export function stationRows(voice: ParamDef["voice"], station: Station): ParamDef[] {
  return PARAMS.filter((p) => p.voice === voice && p.station === station && !p.inert).sort(
    (a, b) => a.order - b.order,
  );
}

/** Boxes of a voice page that have at least one row (cymbal and hi-hat Threshold keep only the click). */
export function voicePage(voice: ParamDef["voice"]): { station: Station; rows: ParamDef[] }[] {
  const stations = voice === -1 ? CAULDRON_STATIONS : VOICE_STATIONS;
  return stations
    .map((station) => ({ station, rows: stationRows(voice, station) }))
    .filter((box) => box.rows.length > 0);
}

/** What each effect uses besides fx_type (design 4.12.3); "off" uses nothing. */
const BREW_USES: Record<string, readonly string[]> = {
  off: [],
  drv: ["fx_dist_type", "fx_p1", "fx_p2", "fx_p3", "fx_p4"],
  rng: ["fx_p1", "fx_wave"],
  cmp: ["fx_p1", "fx_p2", "fx_p3", "fx_p4", "fx_ratio"],
  del: ["fx_p1", "fx_p2", "fx_p3", "fx_p4", "fx_delay_type"],
};

/** Rows of The Brew for the effect named by fx_type's value list ("off", "drv", "rng", "cmp", "del"). */
export function brewRows(effect: string): ParamDef[] {
  const uses = BREW_USES[effect] ?? [];
  return stationRows(-1, "brew").filter((p) => p.name === "fx_type" || uses.includes(p.name));
}

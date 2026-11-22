// Output handling (design 4.12.3): the firmware's seven audio_outN values fold onto the four
// choices of the one wired stereo output. Sending lives in midi/encode.ts (outputValue).
import { OUTPUT_CHOICES, PARAMS, type ParamDef } from "../generated/params";

export type OutputLabel = (typeof OUTPUT_CHOICES)[number]["label"];

export const isOutputParam = (d: ParamDef): boolean => d.slotKey === "audio_out" || d.name === "fx_routing";

/** Choices offered for a parameter: fx_routing has no FX choice. */
export const choicesFor = (d: ParamDef) =>
  d.name === "fx_routing" ? OUTPUT_CHOICES.filter((c) => c.label !== "FX") : OUTPUT_CHOICES;

/** The choice a stored value shows as, and whether it is an alias of it (St2, L2, R2). */
export function choiceOf(value: number): { label: OutputLabel; alias: boolean } {
  for (const c of OUTPUT_CHOICES) {
    if (c.value === value) return { label: c.label, alias: false };
    if (c.aliases.includes(value)) return { label: c.label, alias: true };
  }
  return { label: "main", alias: false };
}

/** Tooltip of an alias: "plays as left". */
export const aliasTitle = (value: number): string | undefined => {
  const c = choiceOf(value);
  return c.alias ? `plays as ${c.label}` : undefined;
};

/** Pan has no effect when the voice goes to one side only (the mixer routes L/R without panning). */
export const panDims = (outValue: number): boolean => {
  const l = choiceOf(outValue).label;
  return l === "left" || l === "right";
};

export const PAN_NOTE = "no effect: this output sends the voice to one side only";

/** The audio_out parameter of the voice a pan parameter belongs to. */
export const outParamOf = (pan: ParamDef): ParamDef | undefined =>
  pan.slotKey === "pan" ? PARAMS.find((p) => p.voice === pan.voice && p.slotKey === "audio_out") : undefined;

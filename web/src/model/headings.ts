import type { Station } from "../generated/params";

export type Voice = -1 | 0 | 1 | 2 | 3 | 4 | 5;

const HEADINGS: Record<Station | "return", string> = {
  call: "Modulator", hero: "Oscillator", threshold: "Click + the fall", trials: "Filter",
  ordeal: "Amp envelope", forge: "Drive", roadBack: "Mixer", return: "To the speakers",
  mentor: "LFO of the voice", bindings: "Modulation targets", oracle: "Velocity of the voice",
  brew: "Effect", pour: "Mix", millstone: "All voices",
};

/** Heading of a box in the sound chain: snare Call is "Noise", cymbal and hi-hat Threshold are "Click". */
export function headingOf(station: Station | "return", voice: Voice): string {
  if (station === "call" && voice === 3) return "Noise";
  if (station === "threshold" && voice >= 4) return "Click";
  return HEADINGS[station];
}

import type { Page } from "../state/session";

/** Voice pages in shield order, then the FX bus page. */
export const PAGES: readonly { page: Page; short: string; name: string; color: string }[] = [
  { page: 0, short: "D1", name: "Drum 1", color: "var(--voice-drum1)" },
  { page: 1, short: "D2", name: "Drum 2", color: "var(--voice-drum2)" },
  { page: 2, short: "D3", name: "Drum 3", color: "var(--voice-drum3)" },
  { page: 3, short: "SN", name: "Snare", color: "var(--voice-snare)" },
  { page: 4, short: "CY", name: "Cymbal", color: "var(--voice-cymbal)" },
  { page: 5, short: "HH", name: "Hi-hat", color: "var(--voice-hihat)" },
  { page: "cauldron", short: "FX", name: "Cauldron", color: "var(--gold)" },
];

/** Audition slots 1..7 (R4.1): the hi-hat has a closed and an open stone. */
export const SLOT_NAMES = ["Drum 1", "Drum 2", "Drum 3", "Snare", "Cymbal", "Closed hi-hat", "Open hi-hat"] as const;
export const SLOT_COLORS = [
  "var(--voice-drum1)", "var(--voice-drum2)", "var(--voice-drum3)", "var(--voice-snare)",
  "var(--voice-cymbal)", "var(--voice-hihat)", "var(--voice-hihat)",
] as const;

export const voiceOf = (page: Page): -1 | 0 | 1 | 2 | 3 | 4 | 5 => (page === "cauldron" ? -1 : page);

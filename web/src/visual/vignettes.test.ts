import { describe, expect, it } from "vitest";
import { PARAMS } from "../generated/params";
import { PICTURE_IDS, picInput, pictureParts, vignetteSvg, type PictureId, type Voice } from "./vignettes";

const VOICES: Voice[] = [0, 1, 2, 3, 4, 5];
const idsOf = (voice: Voice) => PARAMS.filter((p) => p.voice === voice);
/** Values array with every parameter at min, default or max. */
function values(mode: "min" | "def" | "max"): number[] {
  const v: number[] = [];
  for (const p of PARAMS) v[p.id] = mode === "min" ? p.min : mode === "max" ? p.max : p.def;
  return v;
}
const forVoice = (id: PictureId): Voice[] => (id === "brew" || id === "pour" || id === "millstone" ? [-1] : VOICES);
const ser = (svg: Element) => new XMLSerializer().serializeToString(svg);

describe("pictures (design 4.12.5)", () => {
  it("covers every box of the table except Bindings", () => {
    expect([...PICTURE_IDS].sort()).toEqual(
      ["brew", "call", "forge", "hero", "mentor", "millstone", "oracle", "ordeal", "pour", "return", "roadBack", "threshold", "trials"].sort());
  });

  for (const id of PICTURE_IDS) {
    it(`${id}: renders at min, default and max, with and without a strike`, () => {
      const seen = new Set<string>();
      for (const voice of forVoice(id)) {
        for (const mode of ["min", "def", "max"] as const) {
          for (const live of [{}, { t: 3.7, glow: 1, level: 1 }]) {
            const svg = vignetteSvg(id, picInput(voice, values(mode), live));
            expect(svg.getAttribute("viewBox")).toBe("0 0 200 64");
            expect(svg.querySelectorAll("path,circle,text").length).toBeGreaterThan(0);
            expect(ser(svg)).not.toMatch(/NaN|undefined|Infinity|null/);
            seen.add(ser(svg));
          }
        }
      }
      expect(seen.size).toBeGreaterThan(1);
    });
  }

  it("snare Call is a noise cloud whose density follows noise mix", () => {
    const n = (vals: number[]) => pictureParts("call", picInput(3, vals)).filter((p) => p.t === "circle").length;
    expect(n(values("max"))).toBeGreaterThan(n(values("min")));
  });

  it("cymbal and hi-hat Call draw two moons, drums one", () => {
    const moons = (voice: Voice) => pictureParts("call", picInput(voice, values("def"))).filter((p) => p.dash && p.alpha === 0.5).length;
    expect([moons(0), moons(4), moons(5)]).toEqual([1, 2, 2]);
  });

  it("hi-hat Ordeal has two flames and repeat steps add flickers", () => {
    const filled = (voice: Voice, vals: number[]) => pictureParts("ordeal", picInput(voice, vals)).filter((p) => p.fill === "voice").length;
    expect(filled(5, values("def"))).toBe(2);
    expect(filled(0, values("def"))).toBe(1);
    const v = values("def");
    v[idsOf(3).find((p) => p.slotKey === "repeat")!.id] = 3;
    expect(filled(3, v)).toBe(1 + 4);
  });

  it("FX output shows the cauldron caption", () => {
    const v = values("def");
    v[idsOf(0).find((p) => p.slotKey === "audio_out")!.id] = 6;
    expect(pictureParts("return", picInput(0, v)).find((p) => p.t === "text")?.text).toBe("to the Cauldron (FX)");
  });
});

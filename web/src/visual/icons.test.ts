import { describe, expect, it } from "vitest";
import { PARAMS, type IconKind } from "../generated/params";
import { ICON_H, ICON_KINDS, ICON_W, iconInput, renderIcon } from "./icons";
import { chain, LANDMARKS, landmarkGlyph, seal, SEAL_NUMERALS, star } from "./glyphs";

// Kinds named in the table of design 4.12.6.
const DESIGN_KINDS = [
  "wave", "pitch", "fine", "pwm", "fma", "fmf", "mode", "noise", "nmix", "tw", "tv", "tf",
  "da", "dt", "dc", "ft", "fc", "fq", "fd", "aa", "ad", "ac", "rp", "dr", "vo", "dec", "pan",
  "out", "lw", "lr", "la", "lo", "rt", "link", "tog", "va", "fxt", "fxd", "fxp", "rat", "dw", "dly",
];
const USED = [...new Set(PARAMS.map((p) => p.icon))].sort();

function numbers(svg: Element): number[] {
  const out: number[] = [];
  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    for (const a of Array.from(el.attributes)) {
      if (a.name === "d" || ["cx", "cy", "r", "width", "height"].includes(a.name)) {
        for (const m of a.value.match(/-?[\d.]+(?:e-?\d+)?|NaN|Infinity/g) ?? []) out.push(Number(m));
      }
      expect(a.value).not.toMatch(/NaN|undefined|Infinity/);
    }
  }
  return out;
}

describe("icon kinds", () => {
  it("renderers match design 4.12.6 and generated PARAMS exactly", () => {
    const have = [...ICON_KINDS].sort();
    expect(have.filter((k) => !DESIGN_KINDS.includes(k))).toEqual([]);
    expect(DESIGN_KINDS.filter((k) => !have.includes(k as IconKind))).toEqual([]);
    expect(USED.filter((k) => !have.includes(k))).toEqual([]);
    expect(have.filter((k) => !USED.includes(k))).toEqual([]);
    expect(new Set(have).size).toBe(have.length);
  });

  for (const kind of DESIGN_KINDS as IconKind[]) {
    const defs = PARAMS.filter((p) => p.icon === kind);
    it(`${kind}: renders at min, default and max inside the box, and follows the value`, () => {
      expect(defs.length).toBeGreaterThan(0);
      for (const def of defs) {
        const out: string[] = [];
        for (const v of [def.min, def.def, def.max]) {
          const svg = renderIcon(kind, iconInput(def, v));
          expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
          expect(svg.getAttribute("viewBox")).toBe(`0 0 ${ICON_W} ${ICON_H}`);
          expect(svg.querySelectorAll("path,circle").length).toBeGreaterThan(0);
          for (const n of numbers(svg)) expect(Number.isFinite(n)).toBe(true);
          for (const p of svg.querySelectorAll("path")) {
            const c = (p.getAttribute("d") ?? "").match(/-?[\d.]+/g)!.map(Number);
            for (const n of c) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(ICON_W); }
          }
          for (const c of svg.querySelectorAll("circle")) {
            const cx = Number(c.getAttribute("cx")), cy = Number(c.getAttribute("cy"));
            expect(cx).toBeGreaterThanOrEqual(0); expect(cx).toBeLessThanOrEqual(ICON_W);
            expect(cy).toBeGreaterThanOrEqual(0); expect(cy).toBeLessThanOrEqual(ICON_H);
          }
          out.push(new XMLSerializer().serializeToString(svg));
        }
        if (def.max > def.min) expect(out[0]).not.toBe(out[2]); // fx_reverb_type has one value
      }
    });
  }

  it("a bound link takes the tint, an unbound one is dimmed", () => {
    const on = renderIcon("link", { u: 1, w: 3, tint: "#a99bff" });
    const off = renderIcon("link", { u: 0, w: 0, tint: "#a99bff" });
    expect(on.querySelector("path")!.getAttribute("stroke")).toBe("#a99bff");
    expect(off.querySelector("path")!.getAttribute("stroke-opacity")).toBe("0.5");
  });
});

describe("glyphs", () => {
  it("renders each landmark glyph, lit and unlit", () => {
    expect(LANDMARKS).toHaveLength(8);
    const ds = new Set<string>();
    for (const g of LANDMARKS) {
      const a = landmarkGlyph(g), b = landmarkGlyph(g, true);
      ds.add(a.querySelector("path")!.getAttribute("d")!);
      expect(a.getAttribute("data-glyph")).toBe(g);
      expect(a.querySelector("path")!.getAttribute("fill")).toBe("none");
      expect(b.querySelector("path")!.getAttribute("fill")).not.toBe("none");
      numbers(a).forEach((n) => expect(Number.isFinite(n)).toBe(true));
    }
    expect(ds.size).toBe(8);
  });

  it("renders seals I to VIII", () => {
    for (let n = 1; n <= 8; n++) {
      const s = seal(n);
      expect(s.querySelector("text")!.textContent).toBe(SEAL_NUMERALS[n - 1]);
      numbers(s).forEach((v) => expect(Number.isFinite(v)).toBe(true));
    }
    expect(seal(3, true).querySelector("path")!.getAttribute("fill")).toBe("var(--gold)");
    expect(seal(99).querySelector("text")!.textContent).toBe("VIII");
  });

  it("renders stars and chains", () => {
    const s = star(6);
    expect(s.getAttribute("width")).toBe("12");
    numbers(s).forEach((v) => expect(Number.isFinite(v)).toBe(true));
    expect(star(0).querySelector("path")).not.toBeNull();
    const c = chain(4);
    expect(c.querySelectorAll("path")).toHaveLength(4);
    numbers(c).forEach((v) => expect(Number.isFinite(v)).toBe(true));
    expect(chain(0).querySelectorAll("path")).toHaveLength(1);
  });
});

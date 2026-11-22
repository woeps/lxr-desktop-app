import { describe, expect, it } from "vitest";
import { buildFrame, frameSvg, FRAME_IDS, PAD_BOTTOM, PAD_TOP, PAD_X, type Frame } from "./frames";

// Sizes measured in headless Chrome 158 at 1700 px wide on all six voice pages (border boxes):
// widths 146 (station), 114 (return), 314 (mentor), 344 (bindings), 254 (oracle); heights 87 to 739
// (e.g. oracle 87, return 107, forge 157, snare call 256, cymbal threshold 373, hi-hat call 739).
// The range around them is covered too.
const WIDTHS = [60, 100, 114, 146, 254, 314, 344, 480];
const HEIGHTS = [40, 87, 107, 157, 256, 373, 453, 672, 739, 900];

/** True when (x, y) lies strictly inside the padded content rect. */
const inside = (f: Frame, x: number, y: number) =>
  x > PAD_X + 1e-6 && x < f.w - PAD_X - 1e-6 && y > PAD_TOP + 1e-6 && y < f.h - PAD_BOTTOM - 1e-6;

/** Every point on every segment (8 samples each) of every part. */
function* points(f: Frame) {
  for (const p of f.parts) {
    const pts = p.closed ? [...p.pts, p.pts[0]!] : p.pts;
    for (let i = 0; i < pts.length; i++) {
      yield pts[i]!;
      if (i) for (let k = 1; k < 8; k++) {
        const t = k / 8;
        yield [pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * t, pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * t] as const;
      }
    }
  }
}

describe("frames", () => {
  it("lists the fourteen boxes", () => {
    expect(FRAME_IDS).toHaveLength(14);
    expect(new Set(FRAME_IDS).size).toBe(14);
  });

  for (const id of FRAME_IDS) {
    it(`${id}: finite, outside the content padding, at all sizes`, () => {
      for (const w of WIDTHS) for (const h of HEIGHTS) {
        const f = buildFrame(id, w, h);
        let n = 0;
        for (const [x, y] of points(f)) {
          n++;
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          if (inside(f, x, y)) throw new Error(`${id} ${w}x${h}: point ${x},${y} inside content padding`);
        }
        expect(n).toBeGreaterThan(20);
      }
    });

    it(`${id}: scales with the measured size`, () => {
      const a = buildFrame(id, 132, 200), b = buildFrame(id, 264, 400);
      expect([a.w, a.h]).toEqual([132, 200]);
      expect([b.w, b.h]).toEqual([264, 400]);
      const maxX = (f: Frame) => Math.max(...f.parts[0]!.pts.map((p) => p[0]));
      const maxY = (f: Frame) => Math.max(...f.parts[0]!.pts.map((p) => p[1]));
      expect(maxX(a)).toBe(132); expect(maxX(b)).toBe(264);
      expect(maxY(a)).toBe(200); expect(maxY(b)).toBe(400);
    });

    it(`${id}: builds an aria-hidden SVG without HTML strings`, () => {
      const svg = frameSvg(id, 132, 200);
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
      for (const p of svg.querySelectorAll("path")) expect(p.getAttribute("d")).not.toMatch(/NaN|Infinity/);
    });
  }

  it("clamps non-finite and tiny sizes", () => {
    const f = buildFrame("call", NaN, -5);
    for (const [x, y] of points(f)) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });

  it("uses the frame colours of bindings and oracle", () => {
    expect(frameSvg("bindings", 330, 200).querySelector("path")!.getAttribute("stroke")).toBe("var(--bindings)");
    expect(frameSvg("oracle", 240, 100).querySelector("path")!.getAttribute("stroke")).toBe("var(--oracle)");
  });
});

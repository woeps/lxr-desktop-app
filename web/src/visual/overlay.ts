// The journey overlay (design 4.12.7): trail, seals, landmarks, bridges with sparks and labels, the
// fall arc and the chains between the three cards. `computeGeometry` is pure (rectangles in, points
// out); `buildOverlay` makes the SVG once per geometry and `update` changes attributes only.
import { bridgeOpacity, levels, sparkSize, type FilterKind, type LevelInput } from "../model/levels";
import { chain, landmarkGlyph, LANDMARKS, seal, star } from "./glyphs";
import { svgEl } from "./icons";
import type { PicInput } from "./vignettes";

export interface Rect { x: number; y: number; w: number; h: number }
export type Pt = readonly [number, number];

export const SEAL_DY = 26; // seal centre above the box top
export const GLYPH_DY = 56; // landmark centre above the box top
export const BRIDGE_DY = 60; // bridge height below the box top
export const BRIDGE_RISE = 12; // arch height
export const BRIDGES = 7;

export interface Bridge { a: Pt; b: Pt; c: Pt }
export interface Geometry {
  w: number; h: number;
  seals: Pt[]; glyphs: Pt[];
  /** Quadratic segments of the trail, one per pair of seals. */
  trail: { a: Pt; c: Pt; b: Pt }[];
  bridges: Bridge[];
  /** Arc from the Threshold keystone to the Hero crown; null on voices without a pitch envelope. */
  fall: { a: Pt; c: Pt; b: Pt; width: number } | null;
  chains: Pt[];
}

const quad = (a: Pt, c: Pt, b: Pt, u: number): Pt => {
  const v = 1 - u;
  return [v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]];
};
const r1 = (x: number) => Math.round(x * 10) / 10;
const fin = (x: number) => (Number.isFinite(x) ? x : 0);

/**
 * `stations`: the eight boxes in signal order; `cards`: Mentor, Bindings, Oracle; all relative to the
 * overlay. `fallDepth` 0..1 sets the arc width, null draws no arc.
 */
export function computeGeometry(
  size: { w: number; h: number }, stations: readonly Rect[], cards: readonly Rect[], fallDepth: number | null,
): Geometry {
  const seals: Pt[] = stations.map((r) => [r1(fin(r.x + r.w / 2)), r1(fin(r.y - SEAL_DY))]);
  const glyphs: Pt[] = stations.map((r) => [r1(fin(r.x + r.w / 2)), r1(fin(r.y - GLYPH_DY))]);
  const trail = seals.slice(1).map((b, i) => {
    const a = seals[i]!;
    return { a, b, c: [r1((a[0] + b[0]) / 2), r1((a[1] + b[1]) / 2 + (i % 2 ? 7 : -7))] as Pt };
  });
  const bridges = stations.slice(1).map((next, i) => {
    const s = stations[i]!;
    const y = r1(fin(s.y + BRIDGE_DY));
    const a: Pt = [r1(fin(s.x + s.w)), y];
    const b: Pt = [r1(fin(next.x)), y];
    return { a, b, c: [r1((a[0] + b[0]) / 2), r1(y - 2 * BRIDGE_RISE)] as Pt };
  });
  let fall: Geometry["fall"] = null;
  const hero = stations[1], thr = stations[2];
  if (fallDepth !== null && hero && thr) {
    const a: Pt = [r1(thr.x + thr.w / 2 - 30), r1(thr.y - 2)];
    const b: Pt = [r1(hero.x + hero.w / 2 + 30), r1(hero.y - 2)];
    const d = Math.min(1, Math.max(0, fin(fallDepth)));
    fall = { a, b, c: [r1((a[0] + b[0]) / 2), r1(a[1] - 40 - 24 * d)], width: r1(1 + 3 * d) };
  }
  const chains: Pt[] = [];
  for (let i = 0; i + 1 < cards.length; i++) {
    const p = cards[i]!, q = cards[i + 1]!;
    const gap = q.x - (p.x + p.w);
    if (Math.abs(p.y - q.y) < 8 && gap > 0 && gap < 120) chains.push([r1(p.x + p.w + gap / 2), r1(p.y + 40)]);
  }
  return { w: Math.max(0, size.w), h: Math.max(0, size.h), seals, glyphs, trail, bridges, fall, chains };
}

/** Point of the trail at fraction p (0..1) of its length, by equal share per segment. */
export function trailPoint(geo: Geometry, p: number): Pt {
  const n = geo.trail.length;
  if (!n) return geo.seals[0] ?? [0, 0];
  const x = Math.min(1, Math.max(0, p)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const s = geo.trail[i]!;
  return quad(s.a, s.c, s.b, x - i);
}

/** Seals and glyphs that the hero has passed at walk fraction p (the first is lit at once). */
export function litCount(p: number | null, n = 8): number {
  if (p === null) return 0;
  return Math.min(n, 1 + Math.floor(Math.min(1, Math.max(0, p)) * (n - 1) + 1e-9));
}

// ---- model inputs --------------------------------------------------------------------------------
const FILTER_KIND: FilterKind[] = ["lp", "hp", "other", "other", "other", "other", "lp2", "off"];

/** Level inputs of a voice from its picture input; `glow` is the strike envelope. */
export function levelInput(i: PicInput, glow: number): LevelInput {
  const v = i.voice;
  const fm = v <= 2 ? i.u("fmamnt") : v === 3 ? i.u("noise_mix") : Math.max(i.u("mod1_gain"), i.u("mod2_gain"));
  return {
    fm, filter: FILTER_KIND[i.raw("filter_type")] ?? "other", cutoff: i.u("filter_freq"),
    amp: glow, drive: i.u("drive"), volume: i.u("vol"),
  };
}

/** The seven bridge levels of a voice at strike glow `glow`. */
export const voiceLevels = (i: PicInput, glow: number): number[] => levels(levelInput(i, glow));

/** Voices with a pitch envelope: drums 1 to 3 and the snare (design 4.12.7). */
export const hasFall = (voice: number): boolean => voice >= 0 && voice <= 3;

/** Labels above the first, third and fifth bridge; null where no label shows. */
export function bridgeLabels(i: PicInput): (string | null)[] {
  const out: (string | null)[] = Array(BRIDGES).fill(null);
  out[0] = i.voice === 3 || i.raw("mix_mod") === 1 ? "mix" : "FM";
  out[2] = i.raw("trans_vol") > 0 ? "+click" : null;
  out[4] = i.raw("volume_mod_on_off") === 1 ? "×vel" : null;
  return out;
}

// ---- the SVG -------------------------------------------------------------------------------------
export interface OverlayLive {
  /** Seconds of ambient time. */
  t: number;
  /** Hero walk fraction 0..1, null when no strike walks. */
  walk: number | null;
  /** Fall brightness 0..1 while the pitch drop runs. */
  fall: number;
  /** One level per bridge (model/levels.ts). */
  levels: readonly number[];
}
export interface OverlayView {
  svg: SVGSVGElement;
  update(live: OverlayLive): void;
  /** Light bridges from..6 (gold, thicker) and the fall arc (design 4.12.9). */
  highlight(from: number | null, fall: boolean): void;
}

const qd = (a: Pt, c: Pt, b: Pt) => `M${a[0]} ${a[1]}Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`;
const place = (el: SVGElement, p: Pt, half: number, size = half * 2) => {
  el.setAttribute("x", String(r1(p[0] - half)));
  el.setAttribute("y", String(r1(p[1] - half)));
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
};

export function buildOverlay(geo: Geometry, labels: readonly (string | null)[]): OverlayView {
  const svg = svgEl("svg", {
    width: geo.w, height: geo.h, viewBox: `0 0 ${geo.w} ${geo.h}`, "aria-hidden": "true", focusable: "false",
    "data-overlay": "journey",
  }) as SVGSVGElement;
  svg.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;overflow:visible";

  // Trail first, so seals sit on top of it.
  for (const s of geo.trail) {
    svg.appendChild(svgEl("path", {
      d: qd(s.a, s.c, s.b), fill: "none", stroke: "var(--gold)", "stroke-width": 2, "stroke-dasharray": "1 5",
      "stroke-linecap": "round", opacity: 0.7, "data-part": "trail",
    }));
  }

  const glyphs: SVGSVGElement[] = [], seals: SVGSVGElement[] = [];
  geo.glyphs.forEach((p, i) => {
    const g = landmarkGlyph(LANDMARKS[i]!);
    place(g, p, 12, 24);
    svg.appendChild(g); glyphs.push(g);
  });
  geo.seals.forEach((p, i) => {
    const s = seal(i + 1);
    place(s, p, 14, 28);
    svg.appendChild(s); seals.push(s);
  });

  const bridges = geo.bridges.map((b, i) => {
    const g = svgEl("g", { "data-bridge": i });
    g.appendChild(svgEl("path", { d: qd(b.a, b.c, b.b), fill: "none", stroke: "var(--voice)", "stroke-width": 2 }));
    const rail = quad(b.a, b.c, b.b, 0.5);
    g.appendChild(svgEl("path", { d: qd([b.a[0], b.a[1] + 3], [b.c[0], b.c[1] + 3], [b.b[0], b.b[1] + 3]), fill: "none", stroke: "var(--gold)", "stroke-width": 1 }));
    g.appendChild(svgEl("path", { d: `M${rail[0] - 3} ${rail[1] - 4}L${rail[0] + 3} ${rail[1] - 1}L${rail[0] - 3} ${rail[1] + 2}`, fill: "none", stroke: "var(--gold)", "stroke-width": 1.2 }));
    const label = labels[i];
    if (label) {
      const t = svgEl("text", { x: rail[0], y: r1(rail[1] - 10), "text-anchor": "middle", "font-size": 9, fill: "var(--gold)", "data-part": "label" });
      t.textContent = label;
      g.appendChild(t);
    }
    const sparks = [0, 1].map(() => { const s = star(4.5); g.appendChild(s); return s; });
    svg.appendChild(g);
    return { g, sparks, b };
  });

  let fallPath: SVGElement | null = null, fallStar: SVGSVGElement | null = null;
  if (geo.fall) {
    const f = geo.fall;
    fallPath = svgEl("path", { d: qd(f.a, f.c, f.b), fill: "none", stroke: "var(--gold)", "stroke-width": f.width, "stroke-dasharray": "2 4", "stroke-linecap": "round", "data-part": "fall" });
    svg.appendChild(fallPath);
    fallStar = star(5);
    place(fallStar, f.b, 5);
    svg.appendChild(fallStar);
    const peak = quad(f.a, f.c, f.b, 0.5);
    const t = svgEl("text", { x: peak[0], y: r1(peak[1] - 4), "text-anchor": "middle", "font-size": 9, fill: "var(--gold)", "data-part": "fall-label" });
    t.textContent = "the fall";
    svg.appendChild(t);
  }

  geo.chains.forEach((p) => {
    const c = chain(3);
    c.setAttribute("x", String(r1(p[0] - 17)));
    c.setAttribute("y", String(r1(p[1] - 6)));
    svg.appendChild(c);
  });

  const hero = star(7);
  hero.setAttribute("display", "none");
  hero.setAttribute("data-part", "hero");
  svg.appendChild(hero);

  let lit = -1;
  function paintLit(n: number) {
    if (n === lit) return;
    lit = n;
    seals.forEach((s, i) => {
      const on = i < n;
      s.querySelector("path")!.setAttribute("fill", on ? "var(--gold)" : "#000");
      s.querySelector("text")!.setAttribute("fill", on ? "#000" : "var(--gold)");
      s.setAttribute("data-lit", on ? "1" : "0");
    });
    glyphs.forEach((g, i) => {
      g.querySelector("path")!.setAttribute("fill", i < n ? "var(--gold)" : "none");
      g.setAttribute("data-lit", i < n ? "1" : "0");
    });
  }
  paintLit(0);

  return {
    svg,
    highlight(from, fall) {
      bridges.forEach(({ g }, i) => {
        const on = from !== null && i >= from;
        const line = g.querySelector("path")!;
        line.setAttribute("stroke", on ? "var(--gold)" : "var(--voice)");
        line.setAttribute("stroke-width", on ? "3.5" : "2");
        if (on) g.setAttribute("data-hot", "1"); else g.removeAttribute("data-hot");
      });
      if (fallPath) {
        fallPath.setAttribute("stroke-width", String(geo.fall!.width + (fall ? 2 : 0)));
        if (fall) fallPath.setAttribute("data-hot", "1"); else fallPath.removeAttribute("data-hot");
      }
    },
    update(live) {
      bridges.forEach(({ g, sparks, b }, i) => {
        const l = live.levels[i] ?? 0;
        g.setAttribute("opacity", String(r1(bridgeOpacity(l) * 100) / 100));
        const s = sparkSize(l) / 2;
        sparks.forEach((sp, k) => {
          const p = quad(b.a, b.c, b.b, (live.t * 0.45 + k * 0.5 + i * 0.13) % 1);
          place(sp, p, s);
        });
      });
      if (fallPath && fallStar) {
        fallPath.setAttribute("stroke", live.fall > 0 ? "#fff" : "var(--gold)");
        fallPath.setAttribute("opacity", String(r1((0.45 + 0.55 * live.fall) * 100) / 100));
        fallStar.setAttribute("opacity", String(r1((0.4 + 0.6 * live.fall) * 100) / 100));
      }
      if (live.walk === null) hero.setAttribute("display", "none");
      else {
        const p = trailPoint(geo, live.walk);
        hero.removeAttribute("display");
        place(hero, p, 7);
      }
      paintLit(litCount(live.walk));
    },
  };
}

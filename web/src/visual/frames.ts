// Top-edge frames of design 4.12.4: one SVG per box, built from the box's measured size. Every
// frame is a list of polylines in box coordinates (origin = top-left of the border box, y grows
// down). Illustrations rise above the box (y < 0) or sit on its top edge; the outline follows the
// box sides and bottom. Nothing enters the content rect (PAD_*), which frames.test.ts asserts.
// Built with createElementNS only (no HTML strings).
import type { Station } from "../generated/params";

export type FrameId = Station | "return";
export type Pt = readonly [number, number];
export type Ink = "frame" | "accent" | "white";
export interface FramePart { pts: Pt[]; closed?: boolean; stroke: Ink; fill?: Ink | "black"; alpha?: number }
export interface Frame { w: number; h: number; parts: FramePart[] }

/** Content padding of design 4.12.4. */
export const PAD_X = 10;
export const PAD_TOP = 10;
export const PAD_BOTTOM = 12;
export const RADIUS = 7;

/** The fourteen boxes of design 4.12.4, in table order. */
export const FRAME_IDS: readonly FrameId[] = [
  "call", "hero", "threshold", "trials", "ordeal", "forge", "roadBack", "return",
  "mentor", "bindings", "oracle", "brew", "pour", "millstone",
];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;
const r2 = (n: number) => Math.round(n * 100) / 100;

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 8): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
  });
const circle = (cx: number, cy: number, r: number): Pt[] => arc(cx, cy, r, 0, TAU, 12).slice(0, 12);
const mirror = (pts: Pt[], w: number): Pt[] => pts.map(([x, y]) => [w - x, y] as Pt);
const line = (a: Pt, b: Pt, stroke: Ink = "frame"): FramePart => ({ pts: [a, b], stroke });
const sample = (x0: number, x1: number, f: (x: number) => number): Pt[] => {
  const n = Math.max(2, Math.ceil((x1 - x0) / 3));
  return Array.from({ length: n + 1 }, (_, i) => { const x = x0 + ((x1 - x0) * i) / n; return [x, f(x)] as Pt; });
};

/** Mountain ridge: peaks as [fraction of width, height]. The two highest get snow caps. */
const PEAKS: readonly (readonly [number, number])[] = [[0.16, 9], [0.36, 14], [0.54, 8], [0.72, 17], [0.88, 7]];

/** Top edge between the two corner arcs, from x = RADIUS to w - RADIUS. */
function edge(id: FrameId, w: number): Pt[] {
  const a = RADIUS, b = w - RADIUS;
  switch (id) {
    case "call": return sample(a, b, (x) => 1.5 * Math.sin((TAU * x) / 14));
    case "threshold": return sample(a, b, (x) => -17 * (1 - (2 * x / w - 1) ** 2));
    case "trials": {
      const pts: Pt[] = [[a, 0], ...PEAKS.flatMap(([f, hgt]): Pt[] =>
        [[w * (f - 0.07), -hgt * 0.3], [w * f, -hgt]]), [b, 0]];
      return pts.map(([x, y]) => [Math.min(b, Math.max(a, x)), y] as Pt);
    }
    case "roadBack": return sample(a, b, (x) => -5 * (1 - Math.cos((TAU * 2 * x) / w)) / 2 * 1.4);
    case "return": {
      const n = Math.max(1, Math.floor((b - a) / 16)), step = (b - a) / n, pts: Pt[] = [[a, 0]];
      for (let i = 0; i < n; i++) {
        const x = a + i * step;
        pts.push([x + step * 0.375, 0], [x + step * 0.375, -7], [x + step, -7]);
        if (i < n - 1) pts.push([x + step, 0]);
      }
      pts.push([b, -7], [b, 0]);
      return pts;
    }
    case "mentor": return sample(a, b, (x) => -4 * Math.sin((TAU * x) / (w / Math.max(1, Math.round(w / 50)))));
    case "brew": return sample(a, b, (x) => -5 * Math.abs(2 * x / w - 1) ** 4);
    default: return [[a, 0], [b, 0]];
  }
}

const star = (cx: number, cy: number, r: number): Pt[] =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as Pt;
  });

function art(id: FrameId, w: number): FramePart[] {
  const c = w / 2;
  switch (id) {
    case "call": // horn at the left corner, three ripples
      return [
        { pts: [[2, -4], [6, -4], [15, -11], [15, -1], [6, -2]], closed: true, stroke: "accent", fill: "accent", alpha: 0.5 },
        ...[5, 8, 11].map((r): FramePart => ({ pts: arc(18, -6, r, -0.7, 0.7, 5), stroke: "frame" })),
      ];
    case "hero": // crown with a gem
      return [
        { pts: [[c - 9, -1], [c - 9, -11], [c - 4.5, -6], [c, -14], [c + 4.5, -6], [c + 9, -11], [c + 9, -1]], closed: true, stroke: "frame" },
        { pts: [[c, -9], [c + 2.5, -6], [c, -3], [c - 2.5, -6]], closed: true, stroke: "accent", fill: "accent" },
      ];
    case "threshold": // keystone at the apex
      return [{ pts: [[c - 3, -21], [c + 3, -21], [c + 4.5, -14], [c - 4.5, -14]], closed: true, stroke: "accent", fill: "accent", alpha: 0.5 }];
    case "trials": // snow caps on the two highest peaks
      return [...PEAKS].sort((p, q) => q[1] - p[1]).slice(0, 2).map(([f, hgt]): FramePart => {
        const x = w * f;
        return { pts: [[x - 3.5, -hgt + 4.5], [x, -hgt], [x + 3.5, -hgt + 4.5], [x + 1.5, -hgt + 3.5], [x - 1, -hgt + 5]], closed: true, stroke: "white", fill: "white" };
      });
    case "ordeal": { // dragon wings at both corners
      const wing: Pt[] = [[2, -1], [3, -15], [8, -10], [12, -17], [15, -9], [20, -1]];
      return [wing, mirror(wing, w)].map((pts): FramePart => ({ pts, closed: true, stroke: "frame", fill: "accent", alpha: 0.35 }));
    }
    case "forge": // hammer at the right corner, sparks
      return [
        line([w - 21, -1], [w - 10, -10]),
        { pts: [[w - 14, -15], [w - 6, -19], [w - 2, -11], [w - 10, -7]], closed: true, stroke: "frame" },
        line([w - 26, -5], [w - 30, -9], "accent"), line([w - 24, -9], [w - 26, -14], "accent"), line([w - 29, -3], [w - 34, -4], "accent"),
      ];
    case "roadBack": { // half sun with rays behind the hills
      const rays = Array.from({ length: 7 }, (_, i) => {
        const a = Math.PI + ((i + 0.5) * Math.PI) / 7;
        return line([c + 12 * Math.cos(a), -3 + 12 * Math.sin(a)], [c + 17 * Math.cos(a), -3 + 17 * Math.sin(a)], "accent");
      });
      return [{ pts: arc(c, -3, 10, Math.PI, TAU, 10), closed: true, stroke: "accent", fill: "accent", alpha: 0.5 }, ...rays];
    }
    case "return": { // towers with pennants
      const tower: Pt[] = [[0, 0], [0, -13], [3, -13], [3, -15], [6, -15], [6, -13], [9, -13], [9, -15], [12, -15], [12, 0]];
      const pennant: Pt[] = [[6, -15], [6, -26], [14, -22.5], [6, -19]];
      return [tower, mirror(tower, w)].map((pts): FramePart => ({ pts, stroke: "frame" }))
        .concat([pennant, mirror(pennant, w)].map((pts): FramePart => ({ pts, closed: true, stroke: "accent", fill: "accent", alpha: 0.6 })));
    }
    case "mentor": { // spiral, star, crescent, stars
      const spiral = Array.from({ length: 25 }, (_, i) => {
        const t = i / 24, a = t * TAU * 2;
        return [26 + (1 + 8 * t) * Math.cos(a), -11 + (1 + 8 * t) * Math.sin(a)] as Pt;
      });
      const mx = c + 40;
      const crescent = [...arc(mx, -13, 8, -1.9, 1.9, 10), ...arc(mx + 4, -13, 6.5, 1.9, -1.9, 10)];
      return [
        { pts: spiral, stroke: "frame" },
        { pts: star(c, -14, 7), closed: true, stroke: "accent", fill: "accent" },
        { pts: crescent, closed: true, stroke: "frame", fill: "frame", alpha: 0.5 },
        { pts: star(mx + 18, -9, 2.5), closed: true, stroke: "frame" },
        { pts: star(c - 22, -8, 2.2), closed: true, stroke: "frame" },
      ];
    }
    case "bindings": // two interlocked rings
      return [{ pts: circle(c - 4, -9, 6.5), closed: true, stroke: "white" }, { pts: circle(c + 4, -9, 6.5), closed: true, stroke: "white" }];
    case "oracle": { // all-seeing eye in a radiant triangle
      const top = -22;
      const upper = sample(c - 6, c + 6, (x) => -9 - 3.2 * (1 - ((x - c) / 6) ** 2));
      const lens = [...upper, ...upper.map(([x, y]) => [x, -18 - y] as Pt).reverse()];
      const rays = [-0.9, -0.45, 0, 0.45, 0.9].map((a) =>
        line([c + 4 * Math.sin(a), top - 3 * Math.cos(a)], [c + 8 * Math.sin(a), top - 8 * Math.cos(a)], "white"));
      return [
        { pts: [[c - 12, -1], [c, top], [c + 12, -1]], closed: true, stroke: "frame" },
        { pts: lens, closed: true, stroke: "frame" },
        { pts: circle(c, -9, 1.8), closed: true, stroke: "frame", fill: "frame" },
        ...rays,
      ];
    }
    case "brew": // three bubbles
      return [[c - 8, -9, 3], [c + 1, -15, 4], [c + 9, -8, 2.2]].map(([x, y, r]): FramePart =>
        ({ pts: circle(x!, y!, r!), closed: true, stroke: "accent", fill: "accent", alpha: 0.4 }));
    case "pour": // jug spout and a stream
      return [
        { pts: [[w - 28, -1], [w - 26, -12], [w - 14, -12], [w - 8, -6], [w - 3, -4]], stroke: "frame" },
        { pts: [[w - 3, -4], [w - 3, 6]], stroke: "accent" },
      ];
    case "millstone": // wheel with four spokes
      return [
        { pts: circle(c, -10, 9), closed: true, stroke: "frame" },
        { pts: circle(c, -10, 2.5), closed: true, stroke: "frame" },
        ...[0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 2 + 0.4; return line([c + 3 * Math.cos(a), -10 + 3 * Math.sin(a)], [c + 8 * Math.cos(a), -10 + 8 * Math.sin(a)], "accent"); }),
      ];
  }
}

/** The frame of one box at a measured border-box size. Non-finite or tiny sizes are clamped. */
export function buildFrame(id: FrameId, width: number, height: number): Frame {
  const w = Number.isFinite(width) ? Math.max(2 * PAD_X + 2 * RADIUS, width) : 132;
  const h = Number.isFinite(height) ? Math.max(PAD_TOP + PAD_BOTTOM + 2, height) : 100;
  const R = RADIUS;
  const outline: Pt[] = [
    [0, h], [0, R], ...arc(R, R, R, Math.PI, Math.PI * 1.5, 4), ...edge(id, w), ...arc(w - R, R, R, Math.PI * 1.5, TAU, 4), [w, h],
  ];
  const parts: FramePart[] = [{ pts: outline, closed: true, stroke: "frame", fill: "black" }, ...art(id, w)];
  return { w, h, parts: parts.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [r2(x), r2(y)] as Pt) })) };
}

const STROKE: Record<Ink, (id: FrameId) => string> = {
  frame: (id) => (id === "bindings" ? "var(--bindings)" : id === "oracle" ? "var(--oracle)" : "var(--gold)"),
  accent: () => "var(--voice)",
  white: () => "#fff",
};

/** The aria-hidden SVG of a frame; overflow is visible so illustrations may rise above the box. */
export function frameSvg(id: FrameId, width: number, height: number): SVGSVGElement {
  const f = buildFrame(id, width, height);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(f.w));
  svg.setAttribute("height", String(f.h));
  svg.setAttribute("viewBox", `0 0 ${f.w} ${f.h}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("overflow", "visible");
  svg.setAttribute("data-frame", id);
  for (const p of f.parts) {
    const el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("d", p.pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ") + (p.closed ? " Z" : ""));
    el.setAttribute("stroke", STROKE[p.stroke](id));
    el.setAttribute("stroke-width", "1.4");
    el.setAttribute("stroke-linejoin", "round");
    el.setAttribute("fill", p.fill === "black" ? "#000" : p.fill ? STROKE[p.fill](id) : "none");
    if (p.alpha !== undefined && p.fill && p.fill !== "black") el.setAttribute("fill-opacity", String(p.alpha));
    svg.appendChild(el);
  }
  return svg;
}

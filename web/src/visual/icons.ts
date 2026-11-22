// Live parameter icons (design 4.12.6): one 30 x 18 SVG per icon kind, drawn from the row's eased
// value. Built with createElementNS only (no HTML strings).
import type { IconKind, ParamDef } from "../generated/params";

export const ICON_W = 30;
export const ICON_H = 18;
const SVG_NS = "http://www.w3.org/2000/svg";
const N = 25; // points per plotted function
const TWO_PI = Math.PI * 2;

/** Every icon kind of design 4.12.6, in table order. */
export const ICON_KINDS: readonly IconKind[] = [
  "wave", "pitch", "fine", "pwm", "fma", "fmf", "mode", "noise", "nmix", "tw", "tv", "tf",
  "da", "dt", "dc", "ft", "fc", "fq", "fd", "aa", "ad", "ac", "rp", "dr", "vo", "dec", "pan",
  "out", "lw", "lr", "la", "lo", "rt", "link", "tog", "va", "fxt", "fxd", "fxp", "rat", "dw", "dly",
];

/** u: eased value 0..1; w: list index (value - min); tint: stroke colour of a bound link. */
export interface IconInput { u: number; w: number; tint?: string }

/** The icon input of a parameter at a raw value. */
export function iconInput(def: Pick<ParamDef, "min" | "max">, value: number): IconInput {
  const w = Math.max(0, value - def.min);
  const span = def.max - def.min;
  return { u: span > 0 ? Math.min(1, Math.max(0, w / span)) : 0, w };
}

type Part =
  | { t: "path"; d: string; fill?: boolean; dim?: boolean }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: boolean };

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));
const px = (x: number) => r2(1 + 28 * clamp(x, 0, 1)); // x in 0..1 -> 1..29
const py = (y: number) => r2(9 - 7.5 * clamp(y, -1, 1)); // y in -1..1 -> 16.5..1.5
export const hash = (i: number) => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const sin = (x: number, cycles: number, phase = 0) => Math.sin(TWO_PI * cycles * x + phase);

function plot(f: (x: number) => number): Part {
  let d = "";
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    d += `${i ? "L" : "M"}${px(x)} ${py(f(x))}`;
  }
  return { t: "path", d };
}
const line = (d: string, extra: { fill?: boolean; dim?: boolean } = {}): Part => ({ t: "path", d, ...extra });
const dot = (cx: number, cy: number, r = 1.4): Part => ({ t: "circle", cx: r2(cx), cy: r2(cy), r, fill: true });

const tri = (p: number) => 4 * Math.abs(p - Math.floor(p + 0.5)) - 1;
const saw = (p: number) => 2 * (p - Math.floor(p)) - 1;
const sqr = (p: number, duty = 0.5) => (p - Math.floor(p) < duty ? 1 : -1);
const noiseAt = (x: number) => hash(Math.round(x * (N - 1)) + 1) * 2 - 1;

// shortcut: waveform lists differ per parameter; all use the oscillator order and the index wraps.
function shape(w: number, x: number): number {
  const p = 2 * x; // two cycles
  switch (Math.round(w) % 6) {
    case 0: return Math.sin(TWO_PI * p);
    case 1: return tri(p + 0.25);
    case 2: return saw(p);
    case 3: return sqr(p);
    case 4: return noiseAt(x);
    default: return sqr(p, 0.25);
  }
}
export function lfoShape(w: number, p: number): number {
  switch (Math.round(w) % 8) {
    case 0: return Math.sin(TWO_PI * p);
    case 1: return tri(p + 0.25);
    case 2: return saw(p);
    case 3: return -saw(p);
    case 4: return sqr(p);
    case 5: return hash(Math.floor(p * 4) + 1) * 2 - 1;
    case 6: return 2 * (p - Math.floor(p)) ** 3 - 1;
    default: return 1 - 2 * (p - Math.floor(p)) ** 3;
  }
}
const click = (x: number, amp: number, freq: number, pat: number) =>
  amp * Math.exp(-5 * x) * (pat % 2 ? sin(x, freq) : saw(x * freq));
const bump = (x: number, c: number, wd: number) => Math.exp(-(((x - c) / wd) ** 2));

export function response(type: number, x: number, knee: number, peak: number): number {
  const k = clamp(knee, 0.05, 0.95);
  const lp = 1 / (1 + (x / k) ** 4);
  const hp = 1 / (1 + (k / Math.max(x, 0.001)) ** 4);
  const pk = peak * 0.8 * bump(x, k, 0.07);
  let m: number;
  switch (type) {
    case 0: m = lp + pk; break;
    case 1: m = hp + pk; break;
    case 2: m = bump(x, k, 0.2) + pk; break;
    case 3: m = 0.6 * bump(x, k, 0.2) + pk; break;
    case 4: m = 1 - 0.9 * bump(x, k, 0.08); break;
    case 5: m = 0.4 + 0.6 * bump(x, k, 0.07) + pk; break;
    case 6: m = lp ** 2 + pk; break;
    default: m = 0.8;
  }
  return clamp(m, 0, 1.1) * 1.7 - 0.85;
}
export function envelope(x: number, atk: number, dec: number, curve: number): number {
  if (x < atk) return atk > 0 ? x / atk : 1;
  const t = clamp((x - atk) / Math.max(dec, 0.01), 0, 1);
  return 1 - t ** curve;
}

function outIcon(w: number): Part[] {
  const arrow = (x1: number, x2: number): Part => {
    const s = x2 > x1 ? -1 : 1;
    return line(`M${x1} 9L${x2} 9M${x2 + 3 * s} 6L${x2} 9L${x2 + 3 * s} 12`);
  };
  if (w === 6) return [line("M6 6L24 6L22 15L8 15Z"), line("M4 6L26 6"), dot(12, 3), dot(18, 3.5, 1)];
  if (w === 2 || w === 4) return [arrow(26, 4), dot(27, 9)];
  if (w === 3 || w === 5) return [arrow(4, 26), dot(3, 9)];
  return [arrow(15, 3), arrow(15, 27), dot(15, 9)];
}

function parts(kind: IconKind, { u, w }: IconInput): Part[] {
  switch (kind) {
    case "wave": return [plot((x) => shape(w, x))];
    case "pitch": return [plot((x) => sin(x, 1 + 6 * u))];
    case "fine": return [plot((x) => sin(x, 2, (u - 0.5) * Math.PI))];
    case "pwm": return [plot((x) => sqr(2 * x, 0.1 + 0.8 * u))];
    case "fma": return [plot((x) => Math.sin(TWO_PI * 2 * x + 4 * u * sin(x, 6)))];
    case "fmf": return [plot((x) => 0.6 * sin(x, 1 + 9 * u))];
    case "mode": return [plot((x) => (w < 1 ? Math.sin(TWO_PI * 2 * x + 2.5 * sin(x, 5)) : 0.5 * (sin(x, 2) + sin(x, 5))))];
    case "noise": return [plot((x) => { const i = Math.round(x * (N - 1)) + 1; return hash(i) < 0.15 + 0.85 * u ? hash(i + 99) * 2 - 1 : 0; })];
    case "nmix": return [plot((x) => (1 - u) * sin(x, 2) + u * noiseAt(x))];
    case "tw": return [plot((x) => click(x, 0.9, 6, Math.round(w)) * (1 + (Math.round(w) % 3) * 0.1))];
    case "tv": return [plot((x) => click(x, 0.15 + 0.85 * u, 6, 1))];
    case "tf": return [plot((x) => click(x, 0.9, 2 + 8 * u, 1))];
    case "da": return [plot((x) => 0.8 - 1.6 * u * x)];
    case "dt": return [plot((x) => 0.8 - 1.6 * Math.min(1, x / (0.2 + 0.8 * u)))];
    case "dc": return [plot((x) => 0.8 - 1.6 * x ** (0.25 + 3.75 * u))];
    case "ft": return [plot((x) => response(Math.round(w), x, 0.5, 0))];
    case "fc": return [plot((x) => response(0, x, 0.1 + 0.8 * u, 0))];
    case "fq": return [plot((x) => response(0, x, 0.5, u))];
    case "fd": return [plot((x) => Math.tanh((1 + 6 * u) * sin(x, 2)))];
    case "aa": return [plot((x) => envelope(x, 0.05 + 0.6 * u, 0.4, 1.5) * 1.7 - 0.85)];
    case "ad": return [plot((x) => envelope(x, 0.08, 0.1 + 0.9 * u, 1.5) * 1.7 - 0.85)];
    case "ac": return [plot((x) => envelope(x, 0.1, 0.9, 0.3 + 3.2 * u) * 1.7 - 0.85)];
    case "rp": {
      const n = clamp(1 + Math.round(w), 1, 8);
      return [plot((x) => (1 - (x * n - Math.floor(x * n))) * 1.7 - 0.85)];
    }
    case "dr": return [plot((x) => clamp((1 + 8 * u) * sin(x, 2), -0.8, 0.8))];
    case "vo": return [plot((x) => u * sin(x, 2))];
    case "dec": { const s = 3 + 25 * u; return [plot((x) => sin(Math.floor(x * s) / s, 2))]; }
    case "pan": return [line("M3 9L27 9"), dot(3 + 24 * u, 9, 2)];
    case "out": return outIcon(Math.round(w));
    case "lw": return [plot((x) => lfoShape(w, 2 * x))];
    case "lr": return [plot((x) => sin(x, 1 + 7 * u))];
    case "la": return [plot((x) => (0.1 + 0.9 * u) * sin(x, 2))];
    case "lo": return [plot((x) => sin(x, 2, Math.PI * u))];
    case "rt": {
      const arc = line("M21 5A6.5 6.5 0 1 0 22.5 11M21 1.5L21 5.5L17 5.5");
      return w > 0 ? [arc] : [arc, line("M5 15L25 3")];
    }
    case "link": {
      const dim = w <= 0;
      return [
        line("M4 5H14A4 4 0 0 1 14 13H4A4 4 0 0 1 4 5Z", { dim }),
        line("M16 5H26A4 4 0 0 1 26 13H16A4 4 0 0 1 16 5Z", { dim }),
      ];
    }
    case "tog": return [line("M4 5H26A4 4 0 0 1 26 13H4A4 4 0 0 1 4 5Z"), u >= 0.5 ? dot(22, 9, 2.6) : dot(8, 9, 2.6)];
    case "va": return [line(`M2 16L28 16L28 ${r2(14 - 13 * u)}Z`, { fill: true })];
    case "fxt":
      switch (Math.round(w)) {
        case 0: return [line("M5 7H25L23 16H7Z"), line("M10 10L20 14M20 10L10 14")];
        case 1: return [line("M15 16C8 16 8 10 13 6C13 9 15 9 16 6C20 9 22 12 20 15C19 16 17 16 15 16Z")];
        case 2: return [line("M3 9C7 3 11 15 15 9S23 3 27 9")];
        case 3: return [line("M4 5L26 5M6 8L24 8L24 16L6 16Z"), line("M12 11L18 11")];
        default: return [dot(5, 9, 2.4), dot(13, 9, 1.8), dot(20, 9, 1.3), dot(26, 9, 0.9)];
      }
    case "fxd": return [plot((x) => {
      const s = sin(x, 2);
      switch (Math.round(w)) {
        case 0: return Math.tanh(2.5 * s);
        case 1: { const a = 1.8 * s; return Math.abs(a) > 1 ? Math.sign(a) * (2 - Math.abs(a)) : a; }
        default: return clamp(2.5 * s, -0.6, 0.6);
      }
    })];
    case "fxp": {
      const a = Math.PI * (1.15 - 1.3 * u); // 207 deg at 0, -27 deg at 1
      return [line("M4 15A11 11 0 0 1 26 15", { dim: true }), line(`M15 15L${r2(15 + 11 * Math.cos(a))} ${r2(15 - 11 * Math.sin(a))}`), dot(15, 15, 1.5)];
    }
    case "rat": return [plot((x) => {
      const o = x < 0.4 ? x : 0.4 + (x - 0.4) * (1 - 0.9 * u);
      return o * 1.7 - 0.85;
    }), line("M1 16.5L29 1.5", { dim: true })];
    case "dw": return [plot((x) => (1 - u) * sin(x, 2)), plot((x) => u * tri(2 * x))];
    default: // dly
      return Math.round(w) === 0
        ? [dot(5, 9, 2.4), dot(11, 9, 2), dot(17, 9, 1.6), dot(22, 9, 1.2), dot(26, 9, 0.8)]
        : [dot(5, 5, 2.4), dot(11, 13, 2), dot(17, 5, 1.6), dot(22, 13, 1.2), dot(26, 5, 0.8)];
  }
}

export function svgEl(name: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Render one icon. Stroke is the voice colour (`--voice`), or `tint` for a bound link. */
export function renderIcon(kind: IconKind, input: IconInput): SVGSVGElement {
  const svg = svgEl("svg", { viewBox: `0 0 ${ICON_W} ${ICON_H}`, width: ICON_W, height: ICON_H, "aria-hidden": "true", "data-icon": kind }) as SVGSVGElement;
  const color = kind === "link" && input.w > 0 && input.tint ? input.tint : "var(--voice)";
  for (const p of parts(kind, input)) {
    const el = p.t === "path" ? svgEl("path", { d: p.d }) : svgEl("circle", { cx: p.cx, cy: p.cy, r: p.r });
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-width", "1.4");
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    el.setAttribute("fill", p.fill ? color : "none");
    if (p.t === "path" && p.dim) el.setAttribute("stroke-opacity", "0.5");
    svg.appendChild(el);
  }
  return svg;
}

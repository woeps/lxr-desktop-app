// Pictures of design 4.12.5: one 200 x 64 SVG per box, drawn from the eased parameter values of the
// voice. A picture is a list of parts (built by `pictureParts`, pure) and `vignetteSvg` turns it into
// an SVG with createElementNS only (no HTML strings). Ambient motion (`t`, seconds) and the strike
// envelope (`glow`, 0..1) are inputs; the animation loop of task 10 feeds them.
import { PARAMS, type ParamDef } from "../generated/params";
import type { FrameId } from "./frames";
import { clamp, envelope, hash, lfoShape, r2, response, svgEl } from "./icons";

export const PIC_W = 200;
export const PIC_H = 64;
const CX = PIC_W / 2;
const CY = PIC_H / 2;
const TAU = Math.PI * 2;

export type PictureId = Exclude<FrameId, "bindings">;
/** Every box that has a picture, in table order of design 4.12.5. */
export const PICTURE_IDS: readonly PictureId[] = [
  "call", "hero", "threshold", "trials", "ordeal", "forge", "roadBack", "return",
  "mentor", "oracle", "brew", "pour", "millstone",
];

export type Voice = ParamDef["voice"];
export type Ink = "voice" | "gold" | "white" | "lavender";
export interface PicPart {
  t: "path" | "circle" | "text";
  d?: string; cx?: number; cy?: number; r?: number; text?: string; x?: number; y?: number;
  stroke?: Ink; fill?: Ink; alpha?: number; dash?: boolean;
}

/** What a picture reads: the voice, its raw values and the two live inputs. */
export interface PicInput {
  voice: Voice;
  /** Raw value of a parameter by slotKey (the FX bus: by name); default when unknown. */
  raw(key: string): number;
  /** Raw value scaled to 0..1 by the parameter's range. */
  u(key: string): number;
  t: number;      // seconds of ambient time
  glow: number;   // strike envelope 0..1
  level: number;  // estimated output level 0..1 (design 4.12.7)
}

const KEY_INDEX = new Map<string, ParamDef>();
for (const p of PARAMS) KEY_INDEX.set(`${p.voice}:${p.voice === -1 ? p.name : p.slotKey}`, p);

/** Picture input of a voice from a values array indexed by parameter id. */
export function picInput(voice: Voice, values: ArrayLike<number>, live: Partial<Pick<PicInput, "t" | "glow" | "level">> = {}): PicInput {
  const def = (key: string) => KEY_INDEX.get(`${voice}:${key}`);
  const raw = (key: string) => { const d = def(key); return d ? values[d.id] ?? d.def : 0; };
  const u = (key: string) => {
    const d = def(key);
    return d && d.max > d.min ? clamp((raw(key) - d.min) / (d.max - d.min), 0, 1) : 0;
  };
  return { voice, raw, u, t: live.t ?? 0, glow: clamp(live.glow ?? 0, 0, 1), level: clamp(live.level ?? 0, 0, 1) };
}

// ---- helpers -------------------------------------------------------------------------------------
const poly = (pts: readonly (readonly [number, number])[], close = true) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${r2(x)} ${r2(y)}`).join("") + (close ? "Z" : "");
const path = (d: string, stroke: Ink = "voice", extra: Partial<PicPart> = {}): PicPart => ({ t: "path", d, stroke, ...extra });
const dotAt = (cx: number, cy: number, r: number, ink: Ink = "voice", alpha = 1): PicPart =>
  ({ t: "circle", cx: r2(cx), cy: r2(cy), r: r2(r), fill: ink, stroke: ink, alpha });
const ring = (cx: number, cy: number, r: number, ink: Ink = "voice", extra: Partial<PicPart> = {}): PicPart =>
  ({ t: "circle", cx: r2(cx), cy: r2(cy), r: r2(r), stroke: ink, ...extra });
const ngon = (cx: number, cy: number, r: number, n: number, rot = -Math.PI / 2) =>
  poly(Array.from({ length: n }, (_, i) => [cx + r * Math.cos(rot + (TAU * i) / n), cy + r * Math.sin(rot + (TAU * i) / n)] as const));
const wobble = (cx: number, cy: number, r: number, amp: number, lobes: number, ph: number) =>
  poly(Array.from({ length: 36 }, (_, i) => {
    const a = (TAU * i) / 36, rr = r + amp * Math.sin(lobes * a + ph);
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as const;
  }));

/** Outline of an oscillator wave (Sin Tri Saw Rec Noi PWM): circle, triangle, slanted triangle, square, jagged star, pulse bar. */
function waveOutline(wave: number, cx: number, cy: number, r: number, pw = 0.5, rot = 0): PicPart["d"] {
  const rotate = (pts: (readonly [number, number])[]) =>
    pts.map(([x, y]) => [cx + (x - cx) * Math.cos(rot) - (y - cy) * Math.sin(rot), cy + (x - cx) * Math.sin(rot) + (y - cy) * Math.cos(rot)] as const);
  switch (Math.round(wave)) {
    case 1: return ngon(cx, cy, r, 3, -Math.PI / 2 + rot);
    case 2: return poly(rotate([[cx - r, cy + r * 0.8], [cx + r * 0.9, cy + r * 0.8], [cx - r * 0.5, cy - r * 0.9]]));
    case 3: return ngon(cx, cy, r, 4, Math.PI / 4 + rot);
    case 4: return poly(Array.from({ length: 14 }, (_, i) => {
      const rr = i % 2 ? r * 0.45 : r * (0.9 + 0.2 * hash(i + 1)), a = (TAU * i) / 14 + rot;
      return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as const;
    }));
    case 5: { const w = r * (0.25 + 1.5 * clamp(pw, 0, 1)), h = r * 0.8; return poly(rotate([[cx - w / 2, cy - h], [cx + w / 2, cy - h], [cx + w / 2, cy + h], [cx - w / 2, cy + h]])); }
    default: return wobble(cx, cy, r, 0, 1, 0);
  }
}
const moonSize = (u: number) => 2 + 5 * u;

// ---- pictures ------------------------------------------------------------------------------------
function call(i: PicInput): PicPart[] {
  const orb = dotAt(CX, CY, 7, "gold");
  if (i.voice === 3) { // snare: noise cloud, density from noise mix, jitter speed from noise pitch
    const n = Math.round(6 + 54 * i.u("noise_mix")), speed = 1 + 9 * i.u("noise_freq");
    const dots = Array.from({ length: n }, (_, k) => {
      const a = hash(k + 1) * TAU, rr = Math.sqrt(hash(k + 101)) * 1;
      const jx = Math.sin(i.t * speed + k) * 1.5, jy = Math.cos(i.t * speed * 1.3 + k * 2) * 1.5;
      return dotAt(CX + rr * 62 * Math.cos(a) + jx, CY + rr * 26 * Math.sin(a) + jy, 1.1, "voice", 0.55 + 0.45 * hash(k + 7));
    });
    return [...dots, orb];
  }
  const parts: PicPart[] = [orb];
  const moon = (rx: number, ry: number, size: number, freq: number, bright: number, wave: number, k: number) => {
    const a = 1 + k + TAU * i.t * (0.1 + 0.9 * freq);
    const mx = CX + rx * Math.cos(a), my = CY + ry * Math.sin(a);
    parts.push(path(`M${CX + rx} ${CY}A${rx} ${ry} 0 0 1 ${CX} ${CY + ry}A${rx} ${ry} 0 0 1 ${CX - rx} ${CY}A${rx} ${ry} 0 0 1 ${CX} ${CY - ry}A${rx} ${ry} 0 0 1 ${CX + rx} ${CY}Z`, "voice", { dash: true, alpha: 0.5 }));
    parts.push({ t: "path", d: waveOutline(wave, mx, my, size, 0.5, a), stroke: "voice", fill: "voice", alpha: 0.35 + 0.65 * bright });
    return [mx, my] as const;
  };
  if (i.voice <= 2) {
    const [mx, my] = moon(40, 22, moonSize(i.u("fmamnt")), i.u("fm_freq"), i.u("fmamnt"), i.raw("mod_wave_drum"), 0);
    if (i.raw("mix_mod") === 0) parts.push(path(`M${CX} ${CY}L${r2(mx)} ${r2(my)}`, "gold", { dash: true }));
  } else {
    moon(34, 18, moonSize(i.u("mod1_gain")), i.u("mod1_freq"), i.u("mod1_gain"), i.raw("mod1_wave"), 0);
    moon(66, 27, moonSize(i.u("mod2_gain")), i.u("mod2_freq"), i.u("mod2_gain"), i.raw("mod2_wave"), 2.2);
  }
  return parts;
}

function hero(i: PicInput): PicPart[] {
  const r = (26 - 12 * i.u("coarse")) * (1 + 0.05 * Math.sin(TAU * i.t * (0.3 + 1.7 * i.u("coarse"))));
  const tilt = (i.u("fine") - 0.5) * 0.7;
  const parts: PicPart[] = [];
  if (i.glow > 0) parts.push(ring(CX, CY, r + 4 + 12 * i.glow, "white", { alpha: 0.2 + 0.6 * i.glow, fill: "white" }));
  parts.push({ t: "path", d: waveOutline(i.raw("osc_wave"), CX, CY, r, i.u("pwm"), tilt), stroke: "voice", fill: "voice", alpha: 0.35 });
  return parts;
}

function threshold(i: PicInput): PicPart[] {
  const parts: PicPart[] = [];
  const sparkX = i.voice >= 4 ? CX : 36, sparkY = i.voice >= 4 ? CY : 10;
  const n = Math.round(2 + 10 * i.u("trans_vol")), len = 3 + 12 * i.u("trans_freq"), rot = i.raw("trans_wave") * 0.45;
  for (let k = 0; k < n; k++) {
    const a = rot + (TAU * k) / n;
    parts.push(path(`M${r2(sparkX + 3 * Math.cos(a))} ${r2(sparkY + 3 * Math.sin(a))}L${r2(sparkX + (3 + len) * Math.cos(a))} ${r2(sparkY + (3 + len) * Math.sin(a))}`, "gold"));
  }
  if (i.voice >= 4) return parts;
  // falling star: depth = height, time = length, curve = shape
  const h = 6 + 46 * i.u("modamnt"), l = 20 + 130 * (0.15 + 0.85 * i.u("mod_eg")), c = 0.25 + 3.75 * i.u("pitch_slope");
  const pts = Array.from({ length: 25 }, (_, k) => {
    const x = k / 24;
    return [sparkX + l * x, sparkY + h * (1 - Math.pow(1 - x, c))] as const;
  });
  const clipped = pts.map(([x, y]) => [Math.min(x, PIC_W - 4), Math.min(y, PIC_H - 4)] as const);
  parts.push(path(poly(clipped, false), "voice"));
  const run = i.glow > 0 ? clipped[Math.min(24, Math.floor((1 - i.glow) * 24))]! : clipped[0]!;
  parts.push(dotAt(run[0], run[1], i.glow > 0 ? 2.2 : 1.8, i.glow > 0 ? "white" : "gold"));
  return parts;
}

function trials(i: PicInput): PicPart[] {
  const type = Math.round(i.raw("filter_type")), knee = 0.1 + 0.8 * i.u("filter_freq");
  const drive = i.u("filter_drive"), thick = 3 + 14 * drive, peak = i.u("reso");
  const top: (readonly [number, number])[] = [], bottom: (readonly [number, number])[] = [];
  for (let k = 0; k <= 40; k++) {
    const x = k / 40, y = (response(type, x, knee, peak) + 0.85) / 1.7; // 0..~1.1
    const yy = clamp(y, 0, 1.1);
    const sh = 1.2 * Math.sin(TAU * (x * 2 + i.t * 0.15));
    top.push([8 + 184 * x, 58 - 44 * yy + sh]);
    bottom.push([8 + 184 * x, 58 - 44 * yy + thick + sh]);
  }
  const band = poly([...top, ...bottom.reverse()]);
  return [path(band, "voice", { fill: "voice", alpha: 0.2 + 0.4 * drive }), path(poly(top, false), "voice")];
}

function ordeal(i: PicInput): PicPart[] {
  const atk = 0.03 + 0.5 * i.u("veloa"), curve = 0.3 + 3.2 * i.u("vol_slope");
  const flame = (cx: number, w: number, dec: number): PicPart[] => {
    const l = cx - w / 2;
    const top = Array.from({ length: 25 }, (_, k) => [l + (w * k) / 24, 58 - 44 * envelope(k / 24, atk, 0.1 + 0.9 * dec, curve)] as const);
    const parts: PicPart[] = [path(poly([...top, [l + w, 58], [l, 58]]), "voice", { fill: "voice", alpha: 0.3 })];
    if (i.glow > 0) { const y = 58 - 44 * i.glow; parts.push(path(`M${r2(l)} ${r2(y)}L${r2(l + w)} ${r2(y)}`, "white")); }
    return parts;
  };
  const parts: PicPart[] = [];
  if (i.voice === 5) parts.push(...flame(CX - 44, 76, i.u("velod_closed")), ...flame(CX + 44, 76, i.u("velod_open")));
  else parts.push(...flame(i.voice >= 3 ? 60 : CX, i.voice >= 3 ? 100 : 150, i.u("velod")));
  if (i.voice === 3 || i.voice === 4) { // one small flicker per repeat step
    const n = clamp(1 + Math.round(i.raw("repeat")), 1, 8);
    for (let k = 0; k < n; k++) {
      const x = 130 + (k * 60) / Math.max(1, n), h = 22 * (1 - k / (n + 1));
      parts.push(path(`M${r2(x)} 58C${r2(x - 4)} ${r2(58 - h * 0.5)} ${r2(x + 1)} ${r2(58 - h * 0.7)} ${r2(x)} ${r2(58 - h)}C${r2(x + 5)} ${r2(58 - h * 0.6)} ${r2(x + 4)} ${r2(58 - h * 0.3)} ${r2(x)} 58Z`, "voice", { fill: "voice", alpha: 0.5 }));
    }
  }
  if (i.raw("volume_mod_on_off") > 0) parts.push(path("M186 20L186 6M181 11L186 6L191 11", "lavender"));
  return parts;
}

function forge(i: PicInput): PicPart[] {
  const d = i.u("drive"), g = 1 + 7 * d, lim = 0.95;
  const pts = Array.from({ length: 61 }, (_, k) => {
    const x = k / 60, y = clamp(g * Math.sin(TAU * 2 * x), -lim, lim);
    return [10 + 180 * x, CY - 22 * y] as const;
  });
  const n = Math.round(1 + 9 * d);
  const embers = Array.from({ length: n }, (_, k) =>
    dotAt(14 + 172 * hash(k + 3), 62 - ((i.t * (6 + 10 * hash(k + 40)) + 50 * hash(k + 9)) % 52), 1.1, "gold", 0.8));
  return [path(poly(pts, false), "voice"), ...embers];
}

function roadBack(i: PicInput): PicPart[] {
  const out = Math.round(i.raw("audio_out"));
  const pan = out === 2 || out === 4 ? 0 : out === 3 || out === 5 ? 1 : i.u("pan");
  const r = 3 + 15 * i.u("vol"), sides = Math.round(3 + 9 * i.u("voice_decimation"));
  const x = 20 + 160 * pan;
  return [
    path(`M4 50L196 50`, "gold", { alpha: 0.6 }),
    { t: "path", d: sides >= 12 ? `M${r2(x - r)} ${50 - r}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z` : ngon(x, 50 - r, r, sides), stroke: "voice", fill: "voice", alpha: 0.4 },
  ];
}

/** Speaker with sound arcs on the output side(s): -1 left, 1 right, 0 both. */
function speaker(cx: number, cy: number, level: number, side: -1 | 0 | 1): PicPart[] {
  const parts: PicPart[] = [path(poly([[cx - 8, cy - 4], [cx - 3, cy - 4], [cx + 4, cy - 10], [cx + 4, cy + 10], [cx - 3, cy + 4], [cx - 8, cy + 4]]), "gold")];
  const a = 0.3 + 0.7 * level;
  for (const r of [8, 14]) {
    if (side >= 0) parts.push(path(`M${cx + 6 + r / 2} ${cy - r}A${r} ${r} 0 0 1 ${cx + 6 + r / 2} ${cy + r}`, "voice", { alpha: a }));
    if (side <= 0) parts.push(path(`M${cx - 10 - r / 2} ${cy - r}A${r} ${r} 0 0 0 ${cx - 10 - r / 2} ${cy + r}`, "voice", { alpha: a }));
  }
  return parts;
}

function ret(i: PicInput): PicPart[] {
  const out = Math.round(i.raw("audio_out"));
  if (out === 6) { // FX: a bubbling cauldron
    return [...cauldron(CX, 38, 0.6, i.t), { t: "text", text: "to the Cauldron (FX)", x: CX, y: 62, stroke: "gold" }];
  }
  const side = out === 2 || out === 4 ? -1 : out === 3 || out === 5 ? 1 : 0;
  return speaker(CX, CY, i.level, side);
}

function cauldron(cx: number, cy: number, heat: number, t: number): PicPart[] {
  const parts: PicPart[] = [
    path(`M${cx - 22} ${cy - 10}L${cx + 22} ${cy - 10}C${cx + 24} ${cy + 14} ${cx + 12} ${cy + 20} ${cx} ${cy + 20}C${cx - 12} ${cy + 20} ${cx - 24} ${cy + 14} ${cx - 22} ${cy - 10}Z`, "voice", { fill: "voice", alpha: 0.2 }),
    path(`M${cx - 24} ${cy - 10}L${cx + 24} ${cy - 10}`, "gold"),
  ];
  const n = Math.round(1 + 3 * heat);
  for (let k = 0; k < n; k++) parts.push(ring(cx - 12 + 8 * k, cy - 14 - ((t * 8 + k * 7) % 12), 1.5 + (k % 2), "voice"));
  return parts;
}

function mentor(i: PicInput): PicPart[] {
  const w = Math.round(i.raw("wave_lfo")), amp = 0.1 + 0.9 * i.u("amount_lfo"), ph = i.u("offset_lfo");
  const y = (p: number) => CY - 20 * amp * lfoShape(w, p + ph);
  const pts = Array.from({ length: 61 }, (_, k) => [8 + 184 * (k / 60), y((2 * k) / 60)] as const);
  const wp = ((i.t * (0.2 + 2.8 * i.u("freq_lfo"))) % 1);
  const parts: PicPart[] = [path(poly(pts, false), "voice"), dotAt(8 + 184 * wp, y(2 * wp), 3, "gold")];
  const rt = Math.round(i.raw("retrigger_lfo"));
  if (rt > 0) parts.push({ t: "text", text: `restarts on voice ${rt}`, x: 8, y: 10, stroke: "lavender" });
  return parts;
}

function oracle(i: PicInput): PicPart[] {
  const s = i.u("velo_mod_amt"), n = 12;
  const rays = Array.from({ length: n }, (_, k) => {
    const a = (TAU * k) / n, r0 = 12, r1 = 12 + (2 + 16 * s) * (1 + 0.5 * i.glow);
    return path(`M${r2(CX + r0 * Math.cos(a))} ${r2(CY + r0 * 0.9 * Math.sin(a))}L${r2(CX + r1 * Math.cos(a))} ${r2(CY + r1 * 0.9 * Math.sin(a))}`, "lavender", { alpha: 0.5 + 0.5 * i.glow });
  });
  return [ring(CX, CY, 10, "lavender"), ...rays, dotAt(CX, CY, 2, "gold")];
}

function brew(i: PicInput): PicPart[] {
  const type = Math.round(i.raw("fx_type")), p1 = i.u("fx_p1"), p2 = i.u("fx_p2"), p3 = i.u("fx_p3"), p4 = i.u("fx_p4");
  const base = cauldron(CX, 40, type === 0 ? 0 : 0.5, i.t);
  switch (type) {
    case 1: return [...base, ...Array.from({ length: 4 }, (_, k) => path(`M${CX - 14 + 9 * k} 62C${CX - 18 + 9 * k} ${52 - 8 * p1} ${CX - 10 + 9 * k} ${48 - 12 * p1} ${CX - 14 + 9 * k} ${44 - 14 * p1}`, "gold"))];
    case 2: return [path(wobble(CX, CY, 14 + 8 * p1, 2 + 4 * p1, 3 + Math.round(i.raw("fx_wave")), TAU * i.t * (0.2 + 2 * p1)), "voice")];
    case 3: { const lid = 22 - 14 * Math.max(1 - p3, i.u("fx_ratio")) ; return [...base, path(`M${CX - 28} ${r2(lid)}L${CX + 28} ${r2(lid)}`, "gold"), path(`M${CX} ${r2(lid - 6)}L${CX} ${r2(lid)}`, "gold")]; }
    case 4: return Array.from({ length: 5 }, (_, k) => ring(CX, CY, (8 + (6 + 14 * p1) * k), "voice", { alpha: Math.max(0.1, 1 - k * (0.8 - 0.7 * p4)), dash: false }));
    default: return base.slice(0, 2);
  }
}

function pour(i: PicInput): PicPart[] {
  const wet = clamp(i.raw("fx_dry_wet") / 100, 0, 1), wdt = 1 + 14 * wet;
  const out = Math.round(i.raw("fx_routing"));
  const x = out === 2 || out === 4 ? 150 : out === 3 || out === 5 ? 50 : CX;
  return [
    path(`M${CX - 20} 6L${CX + 20} 6L${CX + 14} 16L${CX - 14} 16Z`, "gold"),
    path(`M${r2(x - wdt / 2)} 16L${r2(x - wdt / 2)} 56L${r2(x + wdt / 2)} 56L${r2(x + wdt / 2)} 16Z`, "voice", { fill: "voice", alpha: 0.35 }),
    path(`M${x - 24} 58L${x + 24} 58`, "gold"),
  ];
}

function millstone(i: PicInput): PicPart[] {
  const sides = Math.round(3 + 9 * i.u("voice_decimation_all")), rot = TAU * i.t * 0.05;
  return [
    path(ngon(CX, CY, 24, sides, rot), "voice"),
    ...Array.from({ length: 4 }, (_, k) => path(`M${r2(CX + 4 * Math.cos(rot + k * Math.PI / 2))} ${r2(CY + 4 * Math.sin(rot + k * Math.PI / 2))}L${r2(CX + 20 * Math.cos(rot + k * Math.PI / 2))} ${r2(CY + 20 * Math.sin(rot + k * Math.PI / 2))}`, "gold")),
    ring(CX, CY, 4, "gold"),
  ];
}

const BUILD: Record<PictureId, (i: PicInput) => PicPart[]> = {
  call, hero, threshold, trials, ordeal, forge, roadBack, return: ret, mentor, oracle, brew, pour, millstone,
};

/** The parts of one picture. Every coordinate is finite; callers may draw them as they are. */
export function pictureParts(id: PictureId, input: PicInput): PicPart[] {
  return BUILD[id](input);
}

const STROKE: Record<Ink, string> = { voice: "var(--voice)", gold: "var(--gold)", white: "#fff", lavender: "var(--oracle)" };

/** The aria-hidden SVG of one picture; viewBox 200 x 64, height 42 px (60 px for Mentor and Oracle). */
export function vignetteSvg(id: PictureId, input: PicInput): SVGSVGElement {
  const h = id === "mentor" || id === "oracle" ? 60 : 42;
  const svg = svgEl("svg", {
    viewBox: `0 0 ${PIC_W} ${PIC_H}`, width: "100%", height: h, "aria-hidden": "true", focusable: "false", "data-picture": id,
  }) as SVGSVGElement;
  for (const p of pictureParts(id, input)) {
    const el = p.t === "path" ? svgEl("path", { d: p.d! })
      : p.t === "circle" ? svgEl("circle", { cx: p.cx!, cy: p.cy!, r: p.r! })
      : svgEl("text", { x: p.x!, y: p.y!, "font-size": 8, "text-anchor": p.x === CX ? "middle" : "start" });
    if (p.t === "text") { el.textContent = p.text ?? ""; el.setAttribute("fill", STROKE[p.stroke ?? "gold"]); }
    else {
      el.setAttribute("stroke", STROKE[p.stroke ?? "voice"]);
      el.setAttribute("stroke-width", "1.4");
      el.setAttribute("stroke-linejoin", "round");
      el.setAttribute("stroke-linecap", "round");
      el.setAttribute("fill", p.fill ? STROKE[p.fill] : "none");
      if (p.fill) el.setAttribute("fill-opacity", String(r2(p.alpha ?? 1)));
      if (p.alpha !== undefined && !p.fill) el.setAttribute("stroke-opacity", String(r2(p.alpha)));
      if (p.dash) el.setAttribute("stroke-dasharray", "3 3");
    }
    svg.appendChild(el);
  }
  return svg;
}

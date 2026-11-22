// Landmark glyphs, wax seals, stars and chains of the journey (design 4.12.2, 4.12.7, 4.12.8).
// SVG built with createElementNS only. `lit` fills the shape (a star has walked past it).
import { svgEl } from "./icons";

export const LANDMARKS = ["horn", "sword", "gate", "mountains", "flame", "anvil", "signpost", "castle"] as const;
export type Landmark = (typeof LANDMARKS)[number];

/** One landmark above each station, in signal order I to VIII. */
const LANDMARK_PATHS: Record<Landmark, string> = {
  horn: "M3 15L14 8L20 4L20 20L14 16L3 15ZM20 9Q23 12 20 15",
  sword: "M12 2L14 14L10 14ZM6 14H18M12 14V21M10 21H14",
  gate: "M4 21V10A8 8 0 0 1 20 10V21ZM12 21V12M4 21H20",
  mountains: "M2 20L9 7L13 14L16 10L22 20Z",
  flame: "M12 21C6 21 5 14 10 9C10 12 12 12 13 8C13 6 12 4 12 3C18 7 19 12 17 17C16 19 14 21 12 21Z",
  anvil: "M3 8H18Q21 8 21 11H14L13 14H16V18H20V21H4V18H8V14H10L9 11H3Z",
  signpost: "M12 2V22M12 5H19L21 7.5L19 10H12M12 12H5L3 14.5L5 17H12",
  castle: "M3 21V8H6V10H8V8H11V10H13V8H16V10H18V8H21V21ZM10 21V15A2 2 0 0 1 14 15V21",
};

export function landmarkGlyph(name: Landmark, lit = false): SVGSVGElement {
  const svg = svgEl("svg", { viewBox: "0 0 24 24", width: 24, height: 24, "aria-hidden": "true", "data-glyph": name }) as SVGSVGElement;
  svg.appendChild(svgEl("path", {
    d: LANDMARK_PATHS[name], fill: lit ? "var(--gold)" : "none", stroke: "var(--gold)",
    "stroke-width": 1.4, "stroke-linejoin": "round", "stroke-linecap": "round",
  }));
  return svg;
}

export const SEAL_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"] as const;

/** Wax seal of station n (1 to 8): a scalloped disc with the roman numeral. */
export function seal(n: number, lit = false): SVGSVGElement {
  const i = Math.min(8, Math.max(1, Math.round(n))) - 1;
  const svg = svgEl("svg", { viewBox: "0 0 28 28", width: 28, height: 28, "aria-hidden": "true", "data-seal": i + 1 }) as SVGSVGElement;
  let d = "";
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const r = k % 2 ? 11.5 : 13;
    d += `${k ? "L" : "M"}${(14 + r * Math.cos(a)).toFixed(2)} ${(14 + r * Math.sin(a)).toFixed(2)}`;
  }
  svg.appendChild(svgEl("path", { d: `${d}Z`, fill: lit ? "var(--gold)" : "#000", stroke: "var(--gold)", "stroke-width": 1.2 }));
  const t = svgEl("text", {
    x: 14, y: 18, "text-anchor": "middle", "font-size": 10, "font-family": "var(--font-serif)",
    fill: lit ? "#000" : "var(--gold)",
  });
  t.textContent = SEAL_NUMERALS[i];
  svg.appendChild(t);
  return svg;
}

/** Four-pointed star of radius r (px) centred in a 2r box; used for sparks, wisps and sigils. */
export function star(r = 6, color = "#fff"): SVGSVGElement {
  const s = Math.max(1, r);
  const c = s, k = s * 0.28;
  const d = `M${c} 0L${c + k} ${c - k}L${2 * s} ${c}L${c + k} ${c + k}L${c} ${2 * s}L${c - k} ${c + k}L0 ${c}L${c - k} ${c - k}Z`;
  const svg = svgEl("svg", { viewBox: `0 0 ${2 * s} ${2 * s}`, width: 2 * s, height: 2 * s, "aria-hidden": "true", "data-star": "" }) as SVGSVGElement;
  svg.appendChild(svgEl("path", { d, fill: color }));
  return svg;
}

/** A chain of `links` rounded links laid left to right (joins Mentor, Bindings and Oracle). */
export function chain(links = 3, color = "var(--gold)"): SVGSVGElement {
  const n = Math.max(1, Math.round(links));
  const w = 10 * n + 4;
  const svg = svgEl("svg", { viewBox: `0 0 ${w} 12`, width: w, height: 12, "aria-hidden": "true", "data-chain": n }) as SVGSVGElement;
  for (let i = 0; i < n; i++) {
    const x = 1 + i * 10;
    svg.appendChild(svgEl("path", {
      d: `M${x + 4} 2H${x + 10}A4 4 0 0 1 ${x + 10} 10H${x + 4}A4 4 0 0 1 ${x + 4} 2Z`,
      fill: "none", stroke: color, "stroke-width": 1.4,
    }));
  }
  return svg;
}

export const HEADER_GLYPHS = ["library", "import", "settings", "info"] as const;
export type HeaderGlyph = (typeof HEADER_GLYPHS)[number];

/** One glyph per side panel header (design 4.6). */
const HEADER_PATHS: Record<HeaderGlyph, string[]> = {
  library: ["M4 3H8V21H4ZM9 3H13V21H9Z", "M14.5 5L18.3 4L22 19L18.2 20Z"],
  import: ["M12 3V15M7 10L12 15L17 10", "M4 15V21H20V15"],
  settings: ["M4 7H20M4 12H20M4 17H20", "M9 4V10M15 9V15M8 14V20"],
  info: ["M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3Z", "M12 11V17M12 7V7.5"],
};

export function headerGlyph(name: HeaderGlyph): SVGSVGElement {
  const svg = svgEl("svg", { viewBox: "0 0 24 24", width: 24, height: 24, "aria-hidden": "true", "data-glyph": name }) as SVGSVGElement;
  for (const d of HEADER_PATHS[name]) {
    svg.appendChild(svgEl("path", {
      d, fill: "none", stroke: "var(--gold)", "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
  }
  return svg;
}

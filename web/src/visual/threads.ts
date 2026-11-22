// Threads of the Mentor and the Oracle (design 4.12.8): a curve from the top of the Bindings card
// up to the bottom of the bound station, with a star sigil at each end. Gold for the Mentor,
// lavender for the Oracle, --contested and dashed when another modulator shares the target.
// shortcut: static curves; the wiggle with LFO amount and rate and the travelling dots are not drawn.
import type { ModKind } from "../model/links";
import { svgEl } from "./icons";
import type { Rect } from "./overlay";

export interface Thread { kind: ModKind; station: string; contested: boolean }

/** Station boxes in journey order; "return" and the Cauldron stations take no thread. */
export const THREAD_STATIONS = ["call", "hero", "threshold", "trials", "ordeal", "forge", "roadBack"] as const;

const sigil = (x: number, y: number, color: string) =>
  svgEl("path", { d: `M${x} ${y - 4}L${x + 1.5} ${y - 1.5}L${x + 4} ${y}L${x + 1.5} ${y + 1.5}L${x} ${y + 4}L${x - 1.5} ${y + 1.5}L${x - 4} ${y}L${x - 1.5} ${y - 1.5}Z`, fill: color, "data-part": "sigil" });

export function threadPaths(stations: readonly Rect[], bindings: Rect | undefined, threads: readonly Thread[], w: number, h: number): SVGSVGElement {
  const svg = svgEl("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, "aria-hidden": "true", focusable: "false", "data-overlay": "threads" }) as SVGSVGElement;
  svg.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;overflow:visible";
  if (!bindings) return svg;
  for (const t of threads) {
    const box = stations[THREAD_STATIONS.indexOf(t.station as (typeof THREAD_STATIONS)[number])];
    if (!box) continue;
    const dx = t.kind === "mentor" ? -6 : 6;
    const color = t.contested ? "var(--contested)" : t.kind === "mentor" ? "var(--gold)" : "var(--oracle)";
    const a = [bindings.x + bindings.w / 2 + dx, bindings.y] as const;
    const b = [box.x + box.w / 2 + dx, box.y + box.h] as const;
    const midY = (a[1] + b[1]) / 2;
    const g = svgEl("g", { "data-thread": t.kind, "data-station": t.station, "data-contested": t.contested ? "true" : "false" });
    g.appendChild(svgEl("path", {
      d: `M${a[0]} ${a[1]}C${a[0]} ${midY} ${b[0]} ${midY} ${b[0]} ${b[1]}`, fill: "none", stroke: color, "stroke-width": 2,
      "stroke-linecap": "round", ...(t.contested ? { "stroke-dasharray": "6 4" } : {}),
    }));
    g.appendChild(sigil(a[0], a[1], color));
    g.appendChild(sigil(b[0], b[1], color));
    svg.appendChild(g);
  }
  return svg;
}

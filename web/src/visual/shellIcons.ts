// Plain stroke icons for the shell's buttons, 16 px, built with createElementNS only.
import { svgEl } from "./icons";

export const SHELL_ICONS = ["revert", "send", "copy", "paste", "dice", "save"] as const;
export type ShellIcon = (typeof SHELL_ICONS)[number];

const PATHS: Record<ShellIcon, string[]> = {
  revert: ["M4 7H11A4 4 0 0 1 11 15H6", "M7 3.5L3.5 7L7 10.5"],
  send: ["M2 8H13", "M9 4L13 8L9 12"],
  copy: ["M5 5H13V13H5Z", "M3 11V3H11"],
  paste: ["M4 3H12V14H4Z", "M6.5 1.5H9.5V4.5H6.5Z"],
  dice: ["M2.5 2.5H13.5V13.5H2.5Z", "M5.5 5.5V5.6M10.5 5.5V5.6M8 8V8.1M5.5 10.5V10.6M10.5 10.5V10.6"],
  save: ["M2.5 2.5H11L13.5 5V13.5H2.5Z", "M5 2.5V6H10V2.5", "M5 13.5V9.5H11V13.5"],
};

export function shellIcon(name: ShellIcon): SVGSVGElement {
  const svg = svgEl("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": "true", "data-icon": name }) as SVGSVGElement;
  for (const d of PATHS[name]) {
    svg.appendChild(svgEl("path", {
      d, fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
  }
  return svg;
}

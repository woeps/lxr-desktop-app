import { describe, expect, it } from "vitest";
import { HEADER_GLYPHS, headerGlyph } from "./glyphs";
import { SHELL_ICONS, shellIcon } from "./shellIcons";

const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;

function check(svg: SVGSVGElement) {
  expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  const paths = svg.querySelectorAll("path");
  expect(paths.length).toBeGreaterThan(0);
  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    for (const a of Array.from(el.attributes)) {
      expect(a.value).not.toMatch(/NaN|undefined|Infinity/);
      if (["fill", "stroke"].includes(a.name)) {
        expect(a.value === "none" || a.value === "currentColor" || /^var\(--[\w-]+\)$/.test(a.value)).toBe(true);
      }
      expect(a.value).not.toMatch(COLOUR);
    }
  }
  for (const p of paths) expect(p.getAttribute("d")).toMatch(/^M[\d\s.,MLHVAZCQ-]+$/);
}

describe("header glyphs", () => {
  it("has the four panels, each distinct", () => {
    expect([...HEADER_GLYPHS]).toEqual(["library", "import", "settings", "info"]);
    const ds = new Set(HEADER_GLYPHS.map((g) => Array.from(headerGlyph(g).querySelectorAll("path"), (p) => p.getAttribute("d")).join("|")));
    expect(ds.size).toBe(4);
  });
  it.each(HEADER_GLYPHS)("%s is valid aria-hidden SVG with token colours and the gold 1.5 px stroke", (g) => {
    const svg = headerGlyph(g);
    check(svg);
    expect(svg.getAttribute("data-glyph")).toBe(g);
    for (const p of svg.querySelectorAll("path")) {
      expect(p.getAttribute("stroke")).toBe("var(--gold)");
      expect(p.getAttribute("stroke-width")).toBe("1.5");
    }
  });
});

describe("shell icons", () => {
  it.each(SHELL_ICONS)("%s is a 16 px aria-hidden stroke icon", (n) => {
    const svg = shellIcon(n);
    check(svg);
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("height")).toBe("16");
  });
});

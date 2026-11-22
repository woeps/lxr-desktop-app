import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/visual/tokens.css", "utf8");

function tokens(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) m.set(name, value);
  return m;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every colour token of design 4.12.1 except --bg itself, plus the six voice colours.
const NAMES = [
  "--text", "--muted", "--line", "--gold", "--oracle", "--bindings", "--contested",
  "--voice-drum1", "--voice-drum2", "--voice-drum3", "--voice-snare", "--voice-cymbal", "--voice-hihat",
];

describe("tokens.css", () => {
  const t = tokens();
  it("defines --bg as pure black", () => expect(t.get("--bg")).toBe("#000000"));
  it("defines every design colour", () => {
    for (const n of NAMES) expect(t.has(n), n).toBe(true);
  });
  it.each(NAMES)("%s is at least 7:1 on black", (n) => {
    expect(contrast(t.get(n)!, t.get("--bg")!)).toBeGreaterThanOrEqual(7);
  });
  it("computes known ratios", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#000000", "#000000")).toBeCloseTo(1, 5);
  });
});

// CSS modules of the shell rework (design 4.6, 6): colours come from tokens, never literals.
const SHELL_CSS = ["Controls", "AppBar", "Panel", "Dock"].map((n) => `src/components/${n}.module.css`);

describe("shell CSS modules", () => {
  const read = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return null; } };
  it("includes the shared button styles", () => expect(read(SHELL_CSS[0]!)).not.toBeNull());
  it.each(SHELL_CSS.filter((f) => read(f) !== null))("%s has no colour literals", (file) => {
    const src = read(file)!.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/g) ?? []).toEqual([]);
  });
  it("the scan catches a literal", () => {
    expect("a { color: #fff; }".match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/g)).not.toBeNull();
    expect("a { color: rgb(0 0 0); }".match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/g)).not.toBeNull();
  });
});

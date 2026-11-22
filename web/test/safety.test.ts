import { describe, expect, it } from "vitest";

// Every file under src (including src/generated) except CSS Modules (Vite returns those as class maps, not text), read as raw text.
const files = import.meta.glob(["../src/**/*", "!../src/**/*.module.css"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

import indexHtml from "../index.html?raw";

const forbidden = ["innerHTML", "outerHTML", "insertAdjacentHTML"];

describe("safety", () => {
  it("scans the source tree", () => {
    expect(Object.keys(files).length).toBeGreaterThan(0);
  });

  it("uses no raw HTML injection APIs under src", () => {
    const hits: string[] = [];
    for (const [path, text] of Object.entries(files)) {
      for (const word of forbidden) {
        if (text.includes(word)) hits.push(`${path}: ${word}`);
      }
    }
    expect(hits).toEqual([]);
  });

  // style-src 'self' blocks style="" attributes, which is what Solid's style prop writes. Use visual/css.ts.
  it("sets no inline style attribute or JSX style prop under src", () => {
    const hits: string[] = [];
    for (const [path, text] of Object.entries(files)) {
      if (!/\.tsx?$/.test(path) || path.includes(".test.")) continue;
      if (/\sstyle=|setAttribute\(\s*["']style["']/.test(text)) hits.push(path);
    }
    expect(hits).toEqual([]);
  });

  it("keeps the strict CSP of design 4.10 in index.html (dev loosens it through a Vite plugin only)", () => {
    expect(indexHtml).toContain(
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:",
    );
  });
});

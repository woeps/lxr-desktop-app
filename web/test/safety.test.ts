import { describe, expect, it } from "vitest";

// Every file under src (including src/generated), read as raw text.
const files = import.meta.glob("../src/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

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
});

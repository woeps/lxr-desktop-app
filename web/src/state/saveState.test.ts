import { describe, expect, it } from "vitest";
import type { LibrarySound } from "./library";
import { saveState } from "./saveState";

const entry = (id: string, name: string): LibrarySound =>
  ({ id, name, tags: [], created: "", modified: "", params: {} });
const lib = (...es: LibrarySound[]) => ({
  findByName: (n: string) => es.find((e) => e.name.toLowerCase() === n.trim().toLowerCase()),
});
const kick = entry("a", "Kick1");
const snare = entry("b", "Snare");

describe("saveState", () => {
  it("empty or spaces-only is invalid, so is a bad name", () => {
    expect(saveState("", lib(), null, false).kind).toBe("invalid");
    expect(saveState("   ", lib(kick), "a", true).kind).toBe("invalid");
    expect(saveState("123456789", lib(), null, false).kind).toBe("invalid");
  });
  it("a name no entry has is save", () => {
    expect(saveState("New", lib(kick), "a", false)).toEqual({ kind: "save" });
  });
  it("loaded entry, dirty is update", () => {
    expect(saveState("Kick1", lib(kick), "a", true)).toEqual({ kind: "update", entry: kick });
  });
  it("loaded entry, clean is saved", () => {
    expect(saveState("Kick1", lib(kick), "a", false)).toEqual({ kind: "saved", entry: kick });
  });
  it("a name matching a different entry than the loaded one is update, even when clean", () => {
    expect(saveState("Snare", lib(kick, snare), "a", false)).toEqual({ kind: "update", entry: snare });
    expect(saveState("Snare", lib(kick, snare), null, false)).toEqual({ kind: "update", entry: snare });
  });
  it("case-only difference and surrounding spaces count as a match", () => {
    expect(saveState(" kICK1 ", lib(kick), "a", false)).toEqual({ kind: "saved", entry: kick });
    expect(saveState("kick1", lib(kick), "a", true)).toEqual({ kind: "update", entry: kick });
  });
});

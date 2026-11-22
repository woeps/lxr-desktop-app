import { describe, expect, it, vi } from "vitest";
import { PARAMS } from "../generated/params";
import { factory } from "../model/sound";
import { MAX_PRESET_FILE, scanPack, type PackFile } from "./pack";
import { exportSnd, NAME_LEN, SND_LENGTH } from "./snd";

const file = (path: string, bytes: Uint8Array, read?: () => Promise<ArrayBuffer>): PackFile => ({
  path,
  size: bytes.length,
  read: read ?? (() => Promise.resolve(bytes.slice().buffer)),
});
const snd = (name: string) => exportSnd(factory(name));
const small = PARAMS.find((p) => p.max < 255)!;

describe("scanPack", () => {
  it("keeps 64 .SND files and counts the other 131 as ignored", async () => {
    const files: PackFile[] = [];
    for (let i = 0; i < 64; i++) files.push(file(`kits/K${i}.SND`, snd(`K${i}`)));
    const other = [".PAT", ".SNG", ".CFG", ".NFO", ""];
    for (let i = 0; i < 131; i++) files.push(file(`kits/o${i}${other[i % 5] ? other[i % 5] : ""}`, new Uint8Array(3)));
    const p = await scanPack(files);
    expect(p.presets).toHaveLength(64);
    expect(p.ignored).toBe(131);
    expect(p.unreadable).toEqual([]);
  });

  it("accepts the extension in any case and sorts by file name, then path", async () => {
    const p = await scanPack([
      file("b/z.snd", snd("Z")),
      file("a/B.SND", snd("B2")),
      file("b/B.SND", snd("B1")),
      file("c/a.SND", snd("A")),
      file("d/m.Snd", snd("M")),
    ]);
    expect(p.presets.map((x) => x.key)).toEqual(["a/B.SND", "b/B.SND", "c/a.SND", "d/m.Snd", "b/z.snd"]);
    expect(p.presets[0]!.file).toBe("B.SND");
    expect(p.presets[0]!.name).toBe("B2");
  });

  it("reports padded, extra and clamped as notes", async () => {
    const bad = snd("Bad");
    bad[NAME_LEN + small.id] = small.max + 1;
    const long = new Uint8Array(300);
    long.set(snd("Long"));
    const p = await scanPack([
      file("a.SND", new Uint8Array(5)),
      file("b.SND", snd("B").subarray(0, 200)),
      file("c.SND", long),
      file("d.SND", bad),
    ]);
    const by = Object.fromEntries(p.presets.map((x) => [x.file, x]));
    expect(by["a.SND"]).toBeUndefined();
    expect(p.unreadable[0]!.file).toBe("a.SND");
    expect(by["b.SND"]!.notes).toEqual([`older firmware: ${SND_LENGTH - 200} parameters set to 0`]);
    expect(by["c.SND"]!.notes).toEqual([`${300 - SND_LENGTH} extra bytes ignored`]);
    expect(by["d.SND"]!.notes).toEqual(["1 values out of range were clamped"]);
    expect(by["d.SND"]!.sound.values[small.id]).toBe(small.max);
  });

  it("does not read a file over 64 KiB", async () => {
    const read = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const p = await scanPack([{ path: "big.SND", size: MAX_PRESET_FILE + 1, read }]);
    expect(read).not.toHaveBeenCalled();
    expect(p.unreadable).toHaveLength(1);
    expect(p.presets).toEqual([]);
  });

  it("moves a rejecting read to unreadable and goes on", async () => {
    const p = await scanPack([
      file("a.SND", snd("A"), () => Promise.reject(new Error("x"))),
      file("b.SND", snd("B")),
    ]);
    expect(p.unreadable).toEqual([{ file: "a.SND", reason: "could not be read" }]);
    expect(p.presets.map((x) => x.name)).toEqual(["B"]);
  });

  it("turns control bytes in names into 7-bit text", async () => {
    const d = snd("");
    d.set([0x01, 0xc1, 0x1b, 0xe2], 0);
    const p = await scanPack([file("a.SND", d)]);
    for (const c of p.presets[0]!.name) expect(c.charCodeAt(0)).toBeLessThan(128);
    expect(p.presets[0]!.name).toHaveLength(4);
  });
});

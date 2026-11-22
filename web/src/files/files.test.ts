import { describe, expect, it, vi } from "vitest";
import { PARAMS, TABLE_ID } from "../generated/params";
import { factory, diff } from "../model/sound";
import { toParams, type LibrarySound } from "../state/library";
import { download, type DownloadEnv } from "./download";
import { checkJsonName, exportJson, importJson } from "./json";
import { exportSnd, importSnd, sndNotes, SND_LENGTH } from "./snd";

const lib = (name: string, params: Record<string, number>): LibrarySound => ({
  id: "x", name, tags: ["kick"], created: "2026-01-01T00:00:00Z", modified: "2026-01-02T00:00:00Z", params,
});
const first = PARAMS[0]!;
const numeric = PARAMS.find((p) => p.kind === "num" && p.max < 255)!;

describe("JSON", () => {
  it("exports then imports the identical sound", () => {
    const s = factory("Kick 909");
    s.values[numeric.id] = numeric.max;
    s.values[first.id] = first.max;
    const r = importJson(exportJson([lib("Kick 909", toParams(s))]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [got] = r.value.sounds;
    expect(got!.name).toBe("Kick 909");
    expect(got!.tags).toEqual(["kick"]);
    expect(diff(got!.sound, s)).toEqual([]);
    expect(got!.unknown).toEqual([]);
    expect(got!.missing).toEqual([]);
    expect(got!.clamped).toBe(0);
    expect(r.value.tableMismatch).toBe(false);
    expect(JSON.parse(exportJson([])).table).toBe(TABLE_ID);
  });

  it("reports unknown, missing and clamped, and applies defaults and clamping", () => {
    const params = toParams(factory());
    delete params[first.name];
    params[numeric.name] = numeric.max + 50;
    params["no_such_param"] = 3;
    params["__proto__x"] = 1;
    const r = importJson(exportJson([lib("A", params)]));
    if (!r.ok) throw new Error(r.error);
    const s = r.value.sounds[0]!;
    expect(s.unknown.sort()).toEqual(["__proto__x", "no_such_param"]);
    expect(s.missing).toEqual([first.name]);
    expect(s.clamped).toBe(1);
    expect(s.sound.values[numeric.id]).toBe(numeric.max);
    expect(s.sound.values[first.id]).toBe(first.def);
  });

  it("flags a different table id but still reads the sounds", () => {
    const text = exportJson([lib("A", toParams(factory()))]).replace(TABLE_ID, "0000000000000000");
    const r = importJson(text);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.tableMismatch).toBe(true);
    expect(r.value.sounds).toHaveLength(1);
  });

  it("reports an invalid name instead of importing it silently", () => {
    const r = importJson(exportJson([lib("far too long name", {})]));
    if (!r.ok) throw new Error(r.error);
    expect(r.value.sounds[0]!.nameError).toMatch(/at most 8/);
  });

  it("rejects malformed files", () => {
    for (const bad of ["{", "[]", '{"format":"x"}', '{"format":"lxr-sounds","version":2,"sounds":[]}',
      '{"format":"lxr-sounds","version":1,"sounds":[1]}']) {
      expect(importJson(bad).ok).toBe(false);
    }
  });

  it("accepts only .json", () => {
    expect(checkJsonName("a.json")).toBeNull();
    expect(checkJsonName("a.JSON")).toBeNull();
    expect(checkJsonName("a.snd")).toMatch(/only \.json/);
    expect(checkJsonName("a")).toMatch(/only \.json/);
  });
});

describe(".SND", () => {
  it("exports name padded to 8 plus 247 bytes and reads it back", () => {
    const s = factory("Kick");
    s.values[numeric.id] = numeric.max;
    const bytes = exportSnd(s);
    expect(bytes.length).toBe(SND_LENGTH);
    expect(SND_LENGTH).toBe(255);
    expect([...bytes.subarray(0, 8)]).toEqual([75, 105, 99, 107, 0, 0, 0, 0]);
    expect(bytes[8 + numeric.id]).toBe(numeric.max);
    const r = importSnd("k.snd", bytes);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.sound.name).toBe("Kick");
    expect(diff(r.value.sound, s)).toEqual([]);
    expect(r.value.padded).toBe(0);
    expect(r.value.extra).toBe(0);
  });

  it("pads a short file with 0 and reports it", () => {
    const bytes = exportSnd(factory("Old")).subarray(0, 100);
    const r = importSnd("OLD.SND", bytes);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.padded).toBe(SND_LENGTH - 100);
    const late = PARAMS.find((p) => 8 + p.id >= 100 && p.min === 0)!;
    expect(r.value.sound.values[late.id]).toBe(0);
  });

  it("ignores and reports extra trailing bytes", () => {
    const base = exportSnd(factory("Big"));
    const bytes = new Uint8Array(SND_LENGTH + 13).fill(7);
    bytes.set(base);
    const r = importSnd("big.snd", bytes);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.extra).toBe(13);
    expect(diff(r.value.sound, factory())).toEqual([]);
  });

  it("clamps out-of-range bytes and counts them", () => {
    const bytes = exportSnd(factory("C"));
    bytes[8 + numeric.id] = 255;
    const r = importSnd("c.snd", bytes);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.sound.values[numeric.id]).toBe(numeric.max);
    expect(r.value.clamped).toBeGreaterThanOrEqual(1);
  });

  it("strips trailing spaces from the name and handles a full 8-char name", () => {
    const bytes = exportSnd(factory("Ab"));
    bytes.set([65, 98, 32, 32, 32, 32, 32, 32]);
    const r = importSnd("a.snd", bytes);
    if (r.ok) expect(r.value.sound.name).toBe("Ab");
    bytes.set([49, 50, 51, 52, 53, 54, 55, 56]);
    const r2 = importSnd("a.snd", bytes);
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.value.sound.name).toBe("12345678");
  });

  it("refuses other extensions and tiny files", () => {
    const bytes = exportSnd(factory());
    const r = importSnd("song.PAT", bytes);
    expect(r).toEqual({ ok: false, error: "song.PAT: only kit files (.SND) can be imported; '.PAT' files hold sequencer data" });
    expect(importSnd("x.json", bytes).ok).toBe(false);
    expect(importSnd("x.snd", new Uint8Array(3)).ok).toBe(false);
  });

  // Node's fs without @types/node; the sample is a build artefact of the import_kit ctest.
  const fs = (globalThis as unknown as { process: { getBuiltinModule(n: string): any } }).process.getBuiltinModule("node:fs");
  const sample = "/home/chris/Projects/lxr-desktop-app/build/host/import_kit/TEST.SND";
  it.skipIf(!fs.existsSync(sample))("reads the real kit file written by the import_kit test", () => {
    const r = importSnd("TEST.SND", new Uint8Array(fs.readFileSync(sample)));
    if (!r.ok) throw new Error(r.error);
    expect(r.value.sound.name).toBe("Kick Two");
    expect(r.value.padded).toBe(SND_LENGTH - 198);
    expect(r.value.extra).toBe(0);
  });
});

describe("download", () => {
  it("builds a Blob, clicks a download anchor and revokes the URL", async () => {
    const a = { href: "", download: "", click: vi.fn() } as unknown as HTMLAnchorElement;
    const body = { appendChild: vi.fn(), removeChild: vi.fn() };
    let blob: Blob | undefined;
    const env: DownloadEnv = {
      document: { createElement: vi.fn(() => a), body },
      url: { createObjectURL: vi.fn((b: Blob) => { blob = b; return "blob:fake"; }), revokeObjectURL: vi.fn() },
    };
    download("s.json", "{}", "application/json", env);
    expect(a.href).toBe("blob:fake");
    expect(a.download).toBe("s.json");
    expect(a.click).toHaveBeenCalledTimes(1);
    expect(body.appendChild).toHaveBeenCalledWith(a);
    expect(body.removeChild).toHaveBeenCalledWith(a);
    expect(env.url.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(blob!.type).toBe("application/json");
    expect(await blob!.text()).toBe("{}");
  });
});

describe("sndNotes", () => {
  const base = { sound: factory("A"), padded: 0, extra: 0, clamped: 0 };
  it("gives no notes for a clean file", () => {
    expect(sndNotes(base)).toEqual([]);
  });
  it("gives one text per difference", () => {
    expect(sndNotes({ ...base, padded: 3 })).toEqual(["older firmware: 3 parameters set to 0"]);
    expect(sndNotes({ ...base, extra: 5 })).toEqual(["5 extra bytes ignored"]);
    expect(sndNotes({ ...base, clamped: 2 })).toEqual(["2 values out of range were clamped"]);
  });
});

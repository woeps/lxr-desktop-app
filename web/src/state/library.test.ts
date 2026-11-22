import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "../model/sound";
import { PARAMS } from "../generated/params";
import { cleanName, createLibrary, freeName, LIBRARY_KEY, nameError, QUOTA_MESSAGE, toSound } from "./library";

let n = 0;
let t = 0;
const deps = () => ({
  uuid: () => `id${++n}`,
  now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++t)),
});
const mk = () => createLibrary(localStorage, deps());
const snd = (v = 0) => { const s = factory(); s.values[PARAMS[0]!.id] = v; return s; };

beforeEach(() => { localStorage.clear(); n = 0; t = 0; });

describe("name rule", () => {
  it("accepts 1 to 8 printable ASCII characters", () => {
    for (const ok of ["a", "12345678", " ~ !", "A b"]) expect(nameError(ok)).toBeNull();
  });
  it("refuses empty, long, non-ASCII and control characters with a reason", () => {
    for (const bad of ["", "123456789", "é", "a\tb", "a\u007f", "日本", "😀"]) expect(nameError(bad)).toMatch(/\w/);
  });
  it("add and rename refuse bad names and leave the library unchanged", () => {
    const lib = mk();
    expect(lib.add("toolongname", snd()).ok).toBe(false);
    expect(lib.add("é", snd()).ok).toBe(false);
    const a = lib.add("ok", snd());
    if (!a.ok) throw new Error();
    expect(lib.rename(a.value.id, "").ok).toBe(false);
    expect(lib.get(a.value.id)!.name).toBe("ok");
    expect(lib.sounds).toHaveLength(1);
  });
  it("add and rename refuse a case-insensitive duplicate and leave the library unchanged", () => {
    const lib = mk();
    const a = lib.add("kick", snd());
    const b = lib.add("snare", snd(1));
    if (!a.ok || !b.ok) throw new Error();
    expect(lib.add("KICK", snd(1))).toEqual({ ok: false, error: "A sound named 'KICK' already exists." });
    expect(lib.add("  Kick ", snd(1))).toEqual({ ok: false, error: "A sound named 'Kick' already exists." });
    expect(lib.rename(b.value.id, "Kick")).toEqual({ ok: false, error: "A sound named 'Kick' already exists." });
    expect(lib.rename(a.value.id, "KICK").ok).toBe(true); // own name, other case
    expect(lib.sounds.map((x) => x.name)).toEqual(["KICK", "snare"]);
    expect(lib.findByName("snARE")!.id).toBe(b.value.id);
    expect(lib.findByName("none")).toBeUndefined();
  });
  it("trims names before checking; spaces only fail as empty", () => {
    const lib = mk();
    expect(cleanName("  a ")).toBe("a");
    const r = lib.add("  ab  ", snd());
    expect(r.ok && r.value.name).toBe("ab");
    expect(lib.add("   ", snd())).toEqual({ ok: false, error: "A name needs at least 1 character." });
  });
  it("replace sets values and name in one write, refusing another entry's name", () => {
    const lib = mk();
    const a = lib.add("kick", snd());
    const b = lib.add("snare", snd());
    if (!a.ok || !b.ok) throw new Error();
    expect(lib.replace(a.value.id, "snare", snd(2)).ok).toBe(false);
    expect(lib.replace(a.value.id, "Kick", snd(2)).ok).toBe(true);
    expect(lib.get(a.value.id)!.name).toBe("Kick");
    expect(lib.get(a.value.id)!.params[PARAMS[0]!.name]).toBe(2);
  });
});

describe("CRUD", () => {
  it("adds and reads back values by parameter name", () => {
    const lib = mk();
    const r = lib.add("kick", snd(3));
    if (!r.ok) throw new Error();
    const e = lib.get(r.value.id)!;
    expect(e.params[PARAMS[0]!.name]).toBe(3);
    expect(e.created).toBe(e.modified);
    expect(toSound(e).values[PARAMS[0]!.id]).toBe(3);
    expect(toSound(e).name).toBe("kick");
  });
  it("update replaces values and moves modified only", () => {
    const lib = mk();
    const r = lib.add("kick", snd(1));
    if (!r.ok) throw new Error();
    const id = r.value.id;
    const created = lib.get(id)!.created;
    expect(lib.update(id, snd(2)).ok).toBe(true);
    const e = lib.get(id)!;
    expect(e.params[PARAMS[0]!.name]).toBe(2);
    expect(e.created).toBe(created);
    expect(e.modified > created).toBe(true);
  });
  it("rename and remove", () => {
    const lib = mk();
    const r = lib.add("kick", snd(1));
    if (!r.ok) throw new Error();
    expect(lib.rename(r.value.id, "boom").ok).toBe(true);
    expect(lib.get(r.value.id)!.name).toBe("boom");
    expect(lib.remove(r.value.id).ok).toBe(true);
    expect(lib.sounds).toEqual([]);
  });
  it("unknown ids give an error", () => {
    const lib = mk();
    for (const r of [lib.update("x", snd()), lib.rename("x", "a"), lib.replace("x", "a", snd()), lib.remove("x"), lib.addTag("x", "t")])
      expect(r.ok).toBe(false);
  });
});

describe("tags", () => {
  it("adds trimmed tags once, refuses empty ones, and removes", () => {
    const lib = mk();
    const r = lib.add("kick", snd());
    if (!r.ok) throw new Error();
    const id = r.value.id;
    lib.addTag(id, " bass ");
    lib.addTag(id, "bass");
    lib.addTag(id, "808");
    expect(lib.addTag(id, "  ").ok).toBe(false);
    expect(lib.get(id)!.tags).toEqual(["bass", "808"]);
    lib.removeTag(id, "bass");
    expect(lib.get(id)!.tags).toEqual(["808"]);
  });
  it("add cleans initial tags", () => {
    const lib = mk();
    const r = lib.add("a", snd(), ["x", " x ", ""]);
    if (!r.ok) throw new Error();
    expect(r.value.tags).toEqual(["x"]);
  });
});

describe("sort and filter", () => {
  function fill() {
    const lib = mk();
    const ids: string[] = [];
    for (const [name, tags] of [["snare", ["Drum"]], ["Acid", ["bass", "303"]], ["kick", ["drum", "bass"]]] as const) {
      const r = lib.add(name, snd(), [...tags]);
      if (!r.ok) throw new Error();
      ids.push(r.value.id);
    }
    return { lib, ids };
  }
  it("sorts by name, created and modified", () => {
    const { lib, ids } = fill();
    expect(lib.list().map((s) => s.name)).toEqual(["Acid", "kick", "snare"]);
    expect(lib.list({ sort: "created" }).map((s) => s.name)).toEqual(["kick", "Acid", "snare"]);
    lib.rename(ids[0]!, "snr");
    expect(lib.list({ sort: "modified" }).map((s) => s.name)).toEqual(["snr", "kick", "Acid"]);
  });
  it("filters by name or tag, case-insensitively, and combines with sort", () => {
    const { lib } = fill();
    expect(lib.list({ filter: "ACI" }).map((s) => s.name)).toEqual(["Acid"]);
    expect(lib.list({ filter: "drum" }).map((s) => s.name)).toEqual(["kick", "snare"]);
    expect(lib.list({ filter: "bass", sort: "created" }).map((s) => s.name)).toEqual(["kick", "Acid"]);
    expect(lib.list({ filter: "zzz" })).toEqual([]);
    expect(lib.list({ filter: "  " })).toHaveLength(3);
  });
});

describe("quota", () => {
  function full(): Storage {
    const s = localStorage;
    return new Proxy(s, {
      get(target, p) {
        if (p === "setItem") return () => { throw new DOMException("full", "QuotaExceededError"); };
        const v = Reflect.get(target, p) as unknown;
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  }
  it("returns the user-facing error and leaves the library and storage unchanged", () => {
    const lib = mk();
    const r = lib.add("kick", snd(1));
    if (!r.ok) throw new Error();
    const before = localStorage.getItem(LIBRARY_KEY);
    const snapshot = JSON.parse(JSON.stringify(lib.sounds));

    const bad = createLibrary(full(), deps());
    expect(bad.sounds).toHaveLength(1);
    for (const res of [
      bad.add("new", snd()), bad.update(r.value.id, snd(5)), bad.rename(r.value.id, "zz"),
      bad.remove(r.value.id), bad.addTag(r.value.id, "t"),
    ]) {
      expect(res).toEqual({ ok: false, error: QUOTA_MESSAGE });
    }
    expect(JSON.parse(JSON.stringify(bad.sounds))).toEqual(snapshot);
    expect(localStorage.getItem(LIBRARY_KEY)).toBe(before);
  });
});

describe("persistence", () => {
  it("round trips through storage", () => {
    const a = mk();
    const r = a.add("kick", snd(4), ["x"]);
    if (!r.ok) throw new Error();
    const b = mk();
    expect(JSON.parse(JSON.stringify(b.sounds))).toEqual(JSON.parse(JSON.stringify(a.sounds)));
    expect(JSON.parse(localStorage.getItem(LIBRARY_KEY)!).version).toBe(1);
  });
  it("starts empty with no or corrupt data", () => {
    for (const bad of [null, "{nope", "null", "[]", '{"version":2,"sounds":[]}', '{"version":1,"sounds":5}']) {
      localStorage.clear();
      if (bad !== null) localStorage.setItem(LIBRARY_KEY, bad);
      expect(mk().sounds).toEqual([]);
    }
  });
  it("drops bad entries and repairs fields, keeping good ones", () => {
    const good = { id: "g", name: "ok", tags: ["a", 5, " "], created: "c", modified: "m", params: { [PARAMS[0]!.name]: 999, junk: 1, x: "s" } };
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, sounds: [
      good, { ...good, id: "g" }, { ...good, id: "h", name: "waytoolong" }, { ...good, id: 7 }, null, 3, { ...good, id: "i", created: 1 },
    ] }));
    const lib = mk();
    expect(lib.sounds.map((s) => s.id)).toEqual(["g"]);
    expect(lib.get("g")!.tags).toEqual(["a"]);
    const p = PARAMS[0]!;
    expect(toSound(lib.get("g")!).values[p.id]).toBe(p.max);
  });
  it("missing parameters load as their defaults", () => {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, sounds: [
      { id: "g", name: "ok", tags: [], created: "c", modified: "m", params: {} },
    ] }));
    expect(toSound(mk().get("g")!).values).toEqual(factory("ok").values);
  });
});

describe("storage.persist()", () => {
  it("asks once and returns the result", async () => {
    const persist = vi.fn(async () => true);
    const lib = createLibrary(localStorage, { ...deps(), nav: { storage: { persist } } });
    expect(await lib.requestPersistence()).toBe(true);
    expect(await lib.requestPersistence()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it("tolerates a missing storage manager, a missing persist and a throwing persist", async () => {
    expect(await createLibrary(localStorage, { ...deps(), nav: {} }).requestPersistence()).toBeNull();
    expect(await createLibrary(localStorage, { ...deps(), nav: { storage: {} } }).requestPersistence()).toBeNull();
    const boom = async () => { throw new Error("no"); };
    expect(await createLibrary(localStorage, { ...deps(), nav: { storage: { persist: boom } } }).requestPersistence()).toBeNull();
  });
});

describe("unique names on load (R3.3)", () => {
  const entry = (id: string, name: string, created: string) =>
    ({ id, name, tags: [], created, modified: created, params: {} });
  const load = (...e: ReturnType<typeof entry>[]) => {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, sounds: e }));
    return mk();
  };
  const names = (l: ReturnType<typeof mk>) => l.sounds.map((s) => s.name);

  it("renames later entries by the examples and keeps the first by created", () => {
    const l = load(
      entry("a", "Kick1", "2026-01-01"), entry("b", "kick1", "2026-01-02"),
      entry("c", "Kick", "2026-01-03"), entry("d", "Longnam1", "2026-01-04"),
      entry("e", "longnam1", "2026-01-05"), entry("f", "Abcdefgh", "2026-01-06"),
      entry("g", "ABCDEFGH", "2026-01-07"),
    );
    expect(names(l)).toEqual(["Kick1", "kick2", "Kick", "Longnam1", "longnam2", "Abcdefgh", "ABCDEFG2"]);
    expect(l.renamedOnLoad).toBe(3);
  });
  it("each R3.3 example on its own", () => {
    expect(names(load(entry("a", "Kick1", "1"), entry("b", "Kick1", "2")))).toEqual(["Kick1", "Kick2"]);
    expect(names(load(entry("a", "Kick", "1"), entry("b", "Kick", "2")))).toEqual(["Kick", "Kick2"]);
    expect(names(load(entry("a", "Abcdefgh", "1"), entry("b", "Abcdefgh", "2")))).toEqual(["Abcdefgh", "Abcdefg2"]);
    expect(names(load(entry("a", "Longnam1", "1"), entry("b", "Longnam1", "2")))).toEqual(["Longnam1", "Longnam2"]);
  });
  it("orders by created, not by position, and keeps list order", () => {
    const l = load(entry("late", "Kick", "2026-02-01"), entry("early", "kick", "2026-01-01"));
    expect(l.get("early")!.name).toBe("kick");
    expect(l.get("late")!.name).toBe("Kick2");
    expect(l.sounds.map((s) => s.id)).toEqual(["late", "early"]);
  });
  it("handles a three-way duplicate", () => {
    const l = load(entry("a", "Kick", "1"), entry("b", "Kick", "2"), entry("c", "KICK", "3"));
    expect(names(l)).toEqual(["Kick", "Kick2", "KICK3"]);
    expect(l.renamedOnLoad).toBe(2);
  });
  it("writes the corrected list back once; a clean library is not rewritten", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    load(entry("a", "Kick", "1"), entry("b", "Kick", "2"));
    expect(spy).toHaveBeenCalledTimes(2); // the test's own seed write plus one write-back
    expect(JSON.parse(localStorage.getItem(LIBRARY_KEY)!).sounds.map((s: { name: string }) => s.name)).toEqual(["Kick", "Kick2"]);
    expect(mk().renamedOnLoad).toBe(0);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
  it("keeps the in-memory fix when the write-back hits the quota", () => {
    const raw = JSON.stringify({ version: 1, sounds: [entry("a", "Kick", "1"), entry("b", "Kick", "2")] });
    localStorage.setItem(LIBRARY_KEY, raw);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    const l = mk();
    spy.mockRestore();
    expect(names(l)).toEqual(["Kick", "Kick2"]);
    expect(l.renamedOnLoad).toBe(1);
    expect(localStorage.getItem(LIBRARY_KEY)).toBe(raw);
  });
  it("freeName respects the 8-character limit and an empty stem", () => {
    expect(freeName("Abcdefgh", new Set(["abcdefgh"]))).toBe("Abcdefg2");
    expect(freeName("Abcdefgh", new Set(["abcdefg2"]))).toBe("Abcdefg3");
    expect(freeName("123", new Set())).toBe("s2");
    expect(freeName("a", new Set(Array.from({ length: 8 }, (_, i) => `a${i + 2}`)))).toBe("a10");
  });
});

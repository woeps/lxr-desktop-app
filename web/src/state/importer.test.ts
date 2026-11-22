import { beforeEach, describe, expect, it } from "vitest";
import { flush } from "solid-js";
import { PARAMS } from "../generated/params";
import { exportSnd } from "../files/snd";
import type { PackFile } from "../files/pack";
import { encodeParam, encodeStore } from "../midi/encode";
import { factory } from "../model/sound";
import { createApp, type App } from "./app";
import { createImporter, HINT_MS, SEND_DEBOUNCE_MS, type Importer } from "./importer";

// A fake Web MIDI access and a manual clock, as in app.test.tsx.
let out: number[][];
let timers: { fn: () => void; at: number }[];
let now = 0;
let app: App;
let imp: Importer;

function advance(ms: number) {
  const end = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    timers.splice(timers.indexOf(due), 1);
    now = Math.max(now, due.at);
    due.fn();
    flush();
  }
  now = end;
  flush();
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); flush(); };

const fakeEnv = () => {
  const port = { id: "p1", name: "Fake out", send: (d: number[]) => { out.push(d); } };
  return { isSecureContext: true, requestMIDIAccess: async () => ({ outputs: { values: () => [port] }, onstatechange: null }) };
};

const seeded = PARAMS.filter((p) => p.max >= 3 && !p.inert);
function kit(name: string, seed: number): PackFile {
  const s = factory(name);
  seeded.forEach((p, i) => { s.values[p.id] = (seed + i) % (p.max + 1); });
  const bytes = exportSnd(s);
  return { path: `kits/${name}.SND`, size: bytes.length, read: () => Promise.resolve(bytes.slice().buffer) };
}
const NAMES = ["Aaa", "Bbb", "Ccc", "Ddd"];

async function setup(connect: boolean) {
  localStorage.clear();
  out = []; timers = []; now = 0;
  const clock = {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => { const t = { fn, at: now + ms }; timers.push(t); return t; },
    clearTimeout: (h: unknown) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1); },
  };
  app = createApp({ storage: localStorage, env: fakeEnv(), clock, rng: () => 0.9 });
  imp = createImporter(app, clock);
  await imp.open(NAMES.map((n, i) => kit(n, i + 1)));
  if (connect) { await app.conn.connect(); await tick(); advance(0); }
  out.length = 0;
}
const key = (n: string) => `kits/${n}.SND`;
const sentAll = (values: Uint8Array) =>
  PARAMS.every((p) => {
    const want = JSON.stringify(encodeParam(app.settings.midiSetup(), p, values[p.id]!));
    return out.some((m) => JSON.stringify(m) === want);
  });

describe("importer: selecting", () => {
  beforeEach(() => setup(true));

  it("makes the preset current and baseline as one undo step, and queues nothing before 250 ms", () => {
    const before = app.session.state.current.values.slice();
    expect(imp.select(key("Bbb"))).toBe("ok");
    const p = imp.state.presets.find((x) => x.key === key("Bbb"))!;
    expect(app.session.state.current.name).toBe("Bbb");
    expect([...app.session.state.current.values]).toEqual([...p.sound.values]);
    expect([...app.session.state.baseline.values]).toEqual([...p.sound.values]);
    expect(imp.state.selected).toBe(key("Bbb"));
    advance(SEND_DEBOUNCE_MS - 1);
    expect(out).toEqual([]);
    expect(app.sender.pending()).toBe(false);
    app.session.undo();
    expect([...app.session.state.current.values]).toEqual([...before]);
    expect(app.session.history.canUndo()).toBe(false);
  });

  it("sends every sound parameter after 250 ms and never a store command", () => {
    imp.select(key("Bbb"));
    advance(SEND_DEBOUNCE_MS);
    advance(5000);
    expect(sentAll(app.session.state.current.values)).toBe(true);
    const store = JSON.stringify(encodeStore(app.settings.midiSetup()));
    expect(out.some((m) => JSON.stringify(m) === store)).toBe(false);
    expect(out.flat().length).toBeGreaterThan(0);
  });

  it("sends only the last of three selections within 250 ms", () => {
    imp.select(key("Aaa")); advance(100);
    imp.select(key("Bbb")); advance(100);
    imp.select(key("Ccc"));
    advance(SEND_DEBOUNCE_MS);
    advance(5000);
    expect(imp.state.selected).toBe(key("Ccc"));
    expect(sentAll(app.session.state.current.values)).toBe(true);
    expect(app.cancelled()).toBe(false);
    // The earlier two never started a transfer: a value that only they hold is absent.
    const only = PARAMS.find((p) => {
      const v = (n: string) => imp.state.presets.find((x) => x.key === key(n))!.sound.values[p.id];
      return v("Aaa") !== v("Ccc") && v("Bbb") !== v("Ccc");
    })!;
    const a = imp.state.presets.find((x) => x.key === key("Aaa"))!.sound.values[only.id]!;
    expect(out.some((m) => JSON.stringify(m) === JSON.stringify(encodeParam(app.settings.midiSetup(), only, a)))).toBe(false);
  });

  it("a selection during a running transfer ends with the new values and is not cancelled", () => {
    imp.select(key("Aaa"));
    advance(SEND_DEBOUNCE_MS + 50); // the transfer for Aaa is running
    expect(app.busy()).toBe(true);
    imp.select(key("Bbb"));
    advance(SEND_DEBOUNCE_MS);
    advance(5000);
    expect(app.cancelled()).toBe(false);
    const last = new Map<string, number[]>();
    for (const m of out) last.set(JSON.stringify(m.slice(0, 2)), m);
    const want = imp.state.presets.find((x) => x.key === key("Bbb"))!.sound.values;
    const p = PARAMS.find((q) => "cc" in q.addr && q.max >= 3 && !q.inert)!;
    const lastCc = out.filter((m) => m.length === 3 && m[1] === (p.addr as { cc: number }).cc && (m[0] & 0xf0) === 0xb0).at(-1)!;
    expect(lastCc[2]).toBe(want[p.id]);
  });
});

describe("importer: without an output", () => {
  beforeEach(() => setup(false));

  it("selects, sends nothing and says to connect", () => {
    imp.select(key("Bbb"));
    expect(app.session.state.current.name).toBe("Bbb");
    expect(imp.state.hint).toContain("Connect a MIDI output");
    advance(SEND_DEBOUNCE_MS + 5000);
    expect(out).toEqual([]);
    expect(imp.state.hint).toBeNull(); // gone after HINT_MS
    expect(HINT_MS).toBe(4000);
  });
});

describe("importer: unsaved edits", () => {
  beforeEach(() => setup(true));

  it("returns confirm and changes nothing; force loads it and Undo restores the edits", () => {
    imp.select(key("Aaa"));
    advance(SEND_DEBOUNCE_MS + 5000);
    const p = PARAMS.find((q) => q.max >= 3 && !q.inert)!;
    app.session.applyChanges([[p.id, app.session.state.current.values[p.id]!, (app.session.state.current.values[p.id]! + 1) % (p.max + 1)]]);
    const edited = app.session.state.current.values.slice();
    out.length = 0;
    expect(imp.select(key("Bbb"))).toBe("confirm");
    expect(imp.state.selected).toBe(key("Aaa"));
    expect([...app.session.state.current.values]).toEqual([...edited]);
    advance(SEND_DEBOUNCE_MS + 5000);
    expect(out).toEqual([]);
    expect(imp.select(key("Bbb"), true)).toBe("ok");
    expect(app.session.state.current.name).toBe("Bbb");
    app.session.undo();
    expect([...app.session.state.current.values]).toEqual([...edited]);
  });
});

describe("importer: step and open", () => {
  beforeEach(() => setup(true));

  it("steps from no selection and clamps at both ends", () => {
    imp.step(1);
    expect(imp.state.selected).toBe(key("Aaa"));
    imp.step(-1);
    expect(imp.state.selected).toBe(key("Aaa"));
    imp.step(1);
    expect(imp.state.selected).toBe(key("Bbb"));
  });

  it("steps back from no selection to the last, and stops at the end", async () => {
    await imp.open(NAMES.map((n, i) => kit(n, i + 1)));
    imp.step(-1);
    expect(imp.state.selected).toBe(key("Ddd"));
    imp.step(1);
    expect(imp.state.selected).toBe(key("Ddd"));
  });

  it("open replaces the list and clears selection, hint and timers", async () => {
    imp.select(key("Bbb"));
    await imp.open([kit("Zzz", 9)]);
    expect(imp.state.presets.map((p) => p.name)).toEqual(["Zzz"]);
    expect(imp.state.selected).toBeNull();
    expect(imp.state.hint).toBeNull();
    advance(SEND_DEBOUNCE_MS + 5000);
    expect(out).toEqual([]);
  });
});

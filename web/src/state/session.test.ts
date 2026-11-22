import { beforeEach, describe, expect, it } from "vitest";
import { PARAMS } from "../generated/params";
import { factory } from "../model/sound";
import type { Change } from "../model/sound";
import type { Clock } from "../midi/sender";
import { AUTOSAVE_MS, createSession, SESSION_KEY } from "./session";

const byName = (n: string) => PARAMS.find((p) => p.name === n)!;
const A = byName("vol_slope1");
const B = byName("vol_slope2");

function make(opts: { output?: boolean } = {}) {
  let t = 0;
  let timers: { at: number; fn: () => void }[] = [];
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => { const h = { at: t + ms, fn }; timers.push(h); return h; },
    clearTimeout: (h) => { timers = timers.filter((x) => x !== h); },
  };
  const advance = (ms: number) => {
    t += ms;
    const due = timers.filter((x) => x.at <= t);
    timers = timers.filter((x) => x.at > t);
    due.forEach((x) => x.fn());
  };
  const params: [number, number][] = [];
  const transfers: Uint8Array[] = [];
  const out = { on: opts.output ?? true };
  const session = createSession({
    storage: localStorage, clock, hasOutput: () => out.on,
    sender: { setParam: (id, v) => params.push([id, v]), sendTransfer: (v) => transfers.push(new Uint8Array(v)) },
  });
  return { session, advance, params, transfers, out };
}

const change = (id: number, to: number, from = factory().values[id]!): Change => [id, from, to];

beforeEach(() => localStorage.clear());

describe("session", () => {
  it("starts on the factory sound, page 0, no pick, out of sync", () => {
    const { session } = make();
    expect(session.state.current.values).toEqual(factory().values);
    expect(session.state.page).toBe(0);
    expect(session.state.pick).toBeNull();
    expect(session.state.moduleInSync).toBe(false);
    expect(session.state.abSnapshot).toBeNull();
  });

  it("applyChanges updates the sound, pushes one history step and enqueues sender messages", () => {
    const { session, params } = make();
    session.applyChanges([change(A.id, 30), change(B.id, 40)]);
    expect(session.state.current.values[A.id]).toBe(30);
    expect(session.state.current.values[B.id]).toBe(40);
    expect(params).toEqual([[A.id, 30], [B.id, 40]]);
    expect(session.history.canUndo()).toBe(true);
    session.undo();
    expect(session.state.current.values[A.id]).toBe(factory().values[A.id]);
    expect(session.state.current.values[B.id]).toBe(factory().values[B.id]);
    expect(session.history.canUndo()).toBe(false); // the two edits were one step
    expect(params.length).toBe(4);
    session.redo();
    expect(session.state.current.values[A.id]).toBe(30);
  });

  it("clamps values, skips no-ops, and honours send:false", () => {
    const { session, params } = make();
    session.applyChanges([change(A.id, 9999)]);
    expect(session.state.current.values[A.id]).toBe(A.max);
    const n = params.length;
    session.applyChanges([change(A.id, A.max, A.max)]);
    expect(params.length).toBe(n);
    session.applyChanges([change(B.id, 5)], { send: false });
    expect(params.length).toBe(n);
  });

  it("marks the module out of sync when edited with no output, and sends nothing", () => {
    const { session, params, out } = make({ output: false });
    session.setModuleInSync(true);
    session.applyChanges([change(A.id, 30)]);
    expect(params).toEqual([]);
    expect(session.state.moduleInSync).toBe(false);
    out.on = true;
  });

  it("A/B: first press holds a snapshot, later presses swap and send", () => {
    const { session, params } = make();
    session.applyChanges([change(A.id, 30)]);
    session.toggleAB();
    expect(session.state.abSnapshot!.values[A.id]).toBe(30);
    expect(params.length).toBe(1);
    session.applyChanges([change(A.id, 70, 30)]);
    session.toggleAB();
    expect(session.state.current.values[A.id]).toBe(30);
    expect(session.state.abSnapshot!.values[A.id]).toBe(70);
    session.toggleAB();
    expect(session.state.current.values[A.id]).toBe(70);
    expect(params.at(-1)).toEqual([A.id, 70]);
    session.undo(); // a swap is one undo step
    expect(session.state.current.values[A.id]).toBe(30);
  });

  it("load sets current and baseline, starts a transfer, and revert goes back to it", () => {
    const { session, transfers, params } = make();
    const s = factory("Snare");
    s.values[A.id] = 55;
    session.load(s, "id1");
    expect(session.state.current.name).toBe("Snare");
    expect(session.state.baseline.values[A.id]).toBe(55);
    expect(session.state.libraryId).toBe("id1");
    expect(transfers.length).toBe(1);
    expect(transfers[0]![A.id]).toBe(55);
    expect(params).toEqual([]);
    session.applyChanges([change(A.id, 10, 55), change(B.id, 99)]);
    session.revert();
    expect(session.state.current.values[A.id]).toBe(55);
    expect(session.state.current.values[B.id]).toBe(factory().values[B.id]);
    session.undo(); // revert is one step
    expect(session.state.current.values[A.id]).toBe(10);
  });

  it("load with send false queues nothing, marks the module out of sync, and is one undo step", () => {
    const { session, transfers, params } = make();
    session.setModuleInSync(true);
    const s = factory("Snare");
    s.values[A.id] = 55;
    session.load(s, null, { send: false });
    expect(transfers).toEqual([]);
    expect(params).toEqual([]);
    expect(session.state.moduleInSync).toBe(false);
    expect(session.state.current.values[A.id]).toBe(55);
    expect(session.state.baseline.values[A.id]).toBe(55);
    session.undo();
    expect(session.state.current.values[A.id]).toBe(factory().values[A.id]);
    session.load(s);
    expect(transfers.length).toBe(1);
  });

  it("markSaved moves the baseline to the current sound", () => {
    const { session } = make();
    session.applyChanges([change(A.id, 30)]);
    session.markSaved("x");
    expect(session.state.baseline.values[A.id]).toBe(30);
    expect(session.state.libraryId).toBe("x");
  });

  it("pick mode on and off, page, locks and copy buffer", () => {
    const { session } = make();
    session.setPick("target_lfo");
    expect(session.state.pick).toBe("target_lfo");
    session.setPick(null);
    expect(session.state.pick).toBeNull();
    session.setPage("cauldron");
    expect(session.state.page).toBe("cauldron");
    session.toggleLock(A.id);
    expect(session.state.locked).toEqual([A.id]);
    session.toggleLock(A.id);
    expect(session.state.locked).toEqual([]);
    session.setCopyBuffer(new Map([["k", 1]]));
    expect(session.state.copyBuffer?.get("k")).toBe(1);
  });

  it("autosaves 500 ms after the last change and restores in a new session", () => {
    const a = make();
    a.session.applyChanges([change(A.id, 30)]);
    a.session.toggleAB();
    a.advance(AUTOSAVE_MS - 1);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    a.session.applyChanges([change(B.id, 40)]);
    a.advance(AUTOSAVE_MS - 1);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull(); // debounced
    a.advance(1);
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
    const b = make();
    expect(b.session.state.current.values[A.id]).toBe(30);
    expect(b.session.state.current.values[B.id]).toBe(40);
    expect(b.session.state.abSnapshot!.values[A.id]).toBe(30);
    expect(b.session.state.baseline.values[A.id]).toBe(factory().values[A.id]);
  });

  it("flushSave writes at once; corrupt or wrong-size saved data is ignored", () => {
    const a = make();
    a.session.applyChanges([change(A.id, 30)]);
    a.session.flushSave();
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
    for (const bad of ["{oops", "null", JSON.stringify({ version: 2 }),
      JSON.stringify({ version: 1, current: { name: "x", values: [1, 2, 3] } })]) {
      localStorage.setItem(SESSION_KEY, bad);
      expect(make().session.state.current.values).toEqual(factory().values);
    }
  });
});

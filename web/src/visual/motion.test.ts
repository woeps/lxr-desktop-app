import { describe, expect, it } from "vitest";
import { createMotion, followStep, MAX_DT, type MotionEnv } from "./motion";

function rig(opts: { reduced?: boolean; hidden?: boolean } = {}) {
  let t = 0;
  let nextId = 1;
  const pending = new Map<number, () => void>();
  let rafCalls = 0;
  const doc = { hidden: opts.hidden ?? false, l: [] as (() => void)[], addEventListener(_: "visibilitychange", cb: () => void) { this.l.push(cb); } };
  const mq = { matches: opts.reduced ?? false, l: [] as (() => void)[], addEventListener(_: "change", cb: () => void) { this.l.push(cb); } };
  const env: MotionEnv = {
    now: () => t,
    raf: (cb) => { rafCalls++; pending.set(nextId, cb); return nextId++; },
    caf: (i) => { pending.delete(i); },
    matchMedia: () => mq,
    doc,
  };
  return {
    env, doc, mq, pending,
    get rafCalls() { return rafCalls; },
    /** advance the clock by ms and run the one pending frame, if any */
    tick(ms: number) {
      t += ms;
      const [id, cb] = [...pending][0] ?? [];
      if (id !== undefined) { pending.delete(id); cb!(); }
    },
    advance(ms: number) { t += ms; },
    setHidden(h: boolean) { doc.hidden = h; doc.l.forEach((f) => f()); },
    setReduced(r: boolean) { mq.matches = r; mq.l.forEach((f) => f()); },
  };
}

describe("follow (design 4.12.10)", () => {
  it("one step of dt=0.12 s covers 1-1/e = 0.6321 of the gap", () => {
    expect(followStep(0, 1, 0.12)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(followStep(0, 1, 0.12)).toBeCloseTo(0.63212, 4);
  });
  it("is frame-rate independent: one 100 ms step equals ten 10 ms steps", () => {
    let x = 0;
    for (let i = 0; i < 10; i++) x = followStep(x, 1, 0.01);
    expect(x).toBeCloseTo(followStep(0, 1, 0.1), 10);
    expect(followStep(0, 1, 0.1)).toBeCloseTo(1 - Math.exp(-0.1 / 0.12), 10);
  });
  it("the loop follows at 30 fps and snaps within 0.02, then stops", () => {
    const r = rig();
    const m = createMotion(r.env);
    const f = m.follower(0);
    f.set(1);
    expect(m.running).toBe(true);
    r.tick(1000 / 30);
    expect(f.value).toBeCloseTo(1 - Math.exp(-(1 / 30) / 0.12), 6);
    let n = 0;
    while (r.pending.size && n++ < 200) r.tick(1000 / 30);
    expect(f.value).toBe(1);
    expect(m.running).toBe(false);
  });
  it("clamps dt to 1/30 s after a long stall", () => {
    const r = rig();
    const m = createMotion(r.env);
    const f = m.follower(0);
    f.set(1);
    r.tick(5000);
    expect(f.value).toBeCloseTo(followStep(0, 1, MAX_DT), 10);
  });
  it("calls onChange with each shown value", () => {
    const r = rig();
    const seen: number[] = [];
    const m = createMotion(r.env);
    m.follower(0, (v) => seen.push(v)).set(1);
    r.tick(20);
    expect(seen).toEqual([followStep(0, 1, 0.02)]);
  });
});

describe("loop", () => {
  it("runs exactly one rAF loop however many subscribers, and stops with none", () => {
    const r = rig();
    const m = createMotion(r.env);
    let calls = 0;
    const un = [1, 2, 3].map(() => m.subscribe(() => calls++));
    expect(r.pending.size).toBe(1);
    r.tick(16);
    expect(calls).toBe(3);
    expect(r.pending.size).toBe(1);
    un.forEach((u) => u());
    expect(r.pending.size).toBe(0);
    expect(m.running).toBe(false);
  });
  it("passes dt in seconds to subscribers", () => {
    const r = rig();
    const m = createMotion(r.env);
    const dts: number[] = [];
    m.subscribe((dt) => dts.push(dt));
    r.tick(20);
    expect(dts[0]).toBeCloseTo(0.02, 10);
  });
  it("restarts on the next input after settling", () => {
    const r = rig();
    const m = createMotion(r.env);
    const f = m.follower(0);
    f.set(1);
    for (let i = 0; i < 100 && r.pending.size; i++) r.tick(33);
    expect(m.running).toBe(false);
    f.set(0);
    expect(m.running).toBe(true);
  });
});

describe("strike envelope", () => {
  it("rises linearly over max(attack, 50 ms), then falls linearly, scaled by velocity", () => {
    const r = rig();
    const m = createMotion(r.env);
    const s = m.strike(0.8, 0.01, 0.4); // attack below 50 ms is raised to 50 ms
    expect(s.get()).toBe(0);
    r.advance(25);
    expect(s.get()).toBeCloseTo(0.4, 10); // halfway up the 50 ms rise
    r.advance(25);
    expect(s.get()).toBeCloseTo(0.8, 10); // peak at 50 ms
    r.advance(200);
    expect(s.get()).toBeCloseTo(0.4, 10); // halfway down the 400 ms fall
    r.advance(200);
    expect(s.get()).toBe(0);
    expect(s.done).toBe(true);
  });
  it("a longer attack is kept", () => {
    const r = rig();
    const s = createMotion(r.env).strike(1, 0.2, 0.2);
    r.advance(100);
    expect(s.get()).toBeCloseTo(0.5, 10);
  });
  it("keeps the loop alive while it runs and lets it stop afterwards", () => {
    const r = rig();
    const m = createMotion(r.env);
    const s = m.strike(1, 0.05, 0.1);
    expect(m.running).toBe(true);
    for (let i = 0; i < 20 && r.pending.size; i++) r.tick(33);
    expect(s.done).toBe(true);
    expect(m.running).toBe(false);
  });
});

describe("pause", () => {
  it("stops ambient subscribers and strikes, and resumes when unpaused", () => {
    const r = rig();
    const m = createMotion(r.env);
    let calls = 0;
    m.subscribe(() => calls++);
    r.tick(16);
    expect(calls).toBe(1);
    m.setPaused(true);
    expect(m.running).toBe(false);
    expect(r.pending.size).toBe(0);
    m.strike(1, 0.05, 0.1);
    expect(r.pending.size).toBe(0);
    m.setPaused(false);
    expect(m.running).toBe(true);
  });
  it("still lets an input value follow its target", () => {
    const r = rig();
    const m = createMotion(r.env);
    m.setPaused(true);
    const f = m.follower(0);
    f.set(1);
    r.tick(33);
    expect(f.value).toBeGreaterThan(0);
  });
});

describe("reduced motion", () => {
  it("jumps values to the target, runs no loop, no ambient, no strike", () => {
    const r = rig({ reduced: true });
    const m = createMotion(r.env);
    const seen: number[] = [];
    const f = m.follower(0, (v) => seen.push(v));
    f.set(0.7);
    expect(f.value).toBe(0.7);
    expect(seen).toEqual([0.7]);
    m.subscribe(() => { throw new Error("ambient ran"); });
    expect(m.strike(1, 0.05, 0.2).get()).toBe(0);
    expect(r.rafCalls).toBe(0);
    expect(m.running).toBe(false);
  });
  it("a live change to reduced snaps in-flight values and stops the loop", () => {
    const r = rig();
    const m = createMotion(r.env);
    const f = m.follower(0);
    f.set(1);
    m.subscribe(() => {});
    r.setReduced(true);
    expect(f.value).toBe(1);
    expect(m.running).toBe(false);
  });
});

describe("visibility", () => {
  it("stops while document.hidden and resumes on visibilitychange", () => {
    const r = rig();
    const m = createMotion(r.env);
    let calls = 0;
    m.subscribe(() => calls++);
    r.tick(16);
    r.setHidden(true);
    expect(m.running).toBe(false);
    expect(r.pending.size).toBe(0);
    r.setHidden(false);
    expect(m.running).toBe(true);
    r.tick(16);
    expect(calls).toBe(2);
  });
  it("does not start while hidden", () => {
    const r = rig({ hidden: true });
    const m = createMotion(r.env);
    m.subscribe(() => {});
    m.follower(0).set(1);
    expect(r.rafCalls).toBe(0);
  });
});

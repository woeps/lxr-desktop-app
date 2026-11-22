import { describe, expect, it } from "vitest";
import { createRoot, flush } from "solid-js";
import { createMotion, type MotionEnv } from "../visual/motion";
import { createLive, voiceOfSlot, walkSeconds } from "./live";
import type { App, StrikeEvent } from "./app";

function fake(reduced = false) {
  let now = 0;
  let cb: (() => void) | null = null;
  const env: MotionEnv = {
    now: () => now, raf: (f) => { cb = f; return 1; }, caf: () => { cb = null; },
    matchMedia: () => ({ matches: reduced }),
  };
  const motion = createMotion(env);
  const listeners = new Set<(e: StrikeEvent) => void>();
  const app = {
    motion, settings: { state: { pauseMotion: false } },
    onStrike: (f: (e: StrikeEvent) => void) => { listeners.add(f); return () => listeners.delete(f); },
  } as unknown as App;
  return {
    app, strike: (e: StrikeEvent) => listeners.forEach((f) => f(e)),
    step(ms: number) { now += ms; const f = cb; cb = null; f?.(); flush(); },
  };
}

const make = (...a: Parameters<typeof createLive>) =>
  createRoot((dispose) => ({ live: createLive(...a), dispose }));

describe("createLive", () => {
  it("raises the glow, walks the hero and lights the fall on a strike of its own voice, then settles", () => {
    const f = fake();
    {
      const { live, dispose } = make(f.app, () => 0, (_v, key) => (key === "veloa" ? 0 : key === "velod" ? 20 : 60));
      f.step(16);
      expect(live.walk()).toBeNull();
      f.strike({ slot: 0, velocity: 127 });
      f.step(16); f.step(33); f.step(33); f.step(33);
      expect(live.glow()).toBeGreaterThan(0);
      expect(live.walk()).not.toBeNull();
      expect(live.fall()).toBeGreaterThan(0);
      for (let i = 0; i < 80; i++) f.step(33);
      expect(live.glow()).toBe(0);
      expect(live.walk()).toBeNull();
      expect(live.fall()).toBe(0);
      dispose();
    }
  });
  it("ignores strikes of other voices, and has no fall on the hi-hat", () => {
    const f = fake();
    {
      const { live: hat, dispose } = make(f.app, () => 5, () => 10);
      f.strike({ slot: 2, velocity: 100 });
      f.step(16); f.step(33);
      expect(hat.walk()).toBeNull();
      f.strike({ slot: 6, velocity: 100 });
      f.step(33); f.step(33);
      expect(hat.walk()).not.toBeNull();
      expect(hat.fall()).toBe(0);
      dispose();
    }
  });
  it("does not animate a strike under reduced motion", () => {
    const f = fake(true);
    {
      const { live, dispose } = make(f.app, () => 0, () => 10);
      f.strike({ slot: 0, velocity: 127 });
      f.step(33); f.step(33);
      expect(live.glow()).toBe(0);
      expect(live.walk()).toBeNull();
      dispose();
    }
  });
  it("maps both hi-hat slots to voice 5 and times the walk", () => {
    expect([0, 3, 4, 5, 6].map(voiceOfSlot)).toEqual([0, 3, 4, 5, 5]);
    expect(walkSeconds(0.1, 0.3)).toBeCloseTo(0.65);
    expect(walkSeconds(1, 1)).toBeCloseTo(1.45);
  });
});

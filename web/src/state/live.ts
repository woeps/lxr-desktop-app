// Live animation inputs of one journey page (design 4.12.10): ambient time, the strike envelope
// (glow), the hero walk and the fall. One subscription to the page's single loop.
import { createEffect, createSignal, onCleanup } from "solid-js";
import { hasFall } from "../visual/overlay";
import type { App } from "./app";

export interface Live {
  /** Seconds of ambient time (0 under reduced motion). */
  t(): number;
  /** Strike envelope 0..1 of this voice. */
  glow(): number;
  /** Hero walk fraction 0..1 while a strike walks, else null. */
  walk(): number | null;
  /** Fall brightness 0..1 while the pitch drop runs. */
  fall(): number;
}

const u = (v: number) => Math.min(1, Math.max(0, v / 127));

/** Seconds of the amp envelope phases and of the pitch drop, from the raw parameters. */
export function strikeTimes(attack: number, decay: number, fallTime: number | null) {
  // shortcut: the firmware's envelope times are not tabulated, so these are visual stand-ins.
  return { attack: 0.02 + 0.5 * u(attack) ** 2, decay: 0.08 + 1.6 * u(decay), fall: fallTime === null ? 0 : 0.05 + 0.6 * u(fallTime) };
}

/** Hero walk duration: 0.25 s + min(1.2 s, attack + decay). */
export const walkSeconds = (attack: number, decay: number): number => 0.25 + Math.min(1.2, attack + decay);

/** Slot 0..6 to voice 0..5: both hi-hat slots belong to the hi-hat voice. */
export const voiceOfSlot = (slot: number): number => Math.min(5, slot);

export function createLive(app: App, voice: () => number, raw: (voice: number, slotKey: string) => number): Live {
  const [t, setT] = createSignal(0);
  const [glow, setGlow] = createSignal(0);
  const [walk, setWalk] = createSignal<number | null>(null);
  const [fall, setFall] = createSignal(0);
  let run: { s: ReturnType<typeof app.motion.strike>; t0: number | null; walk: number; fall: number; end: number } | null = null;

  const offStrike = app.onStrike((e) => {
    if (voiceOfSlot(e.slot) !== voice() || app.motion.reduced) return;
    const v = voice();
    const times = strikeTimes(raw(v, "veloa"), raw(v, v === 5 ? (e.slot === 6 ? "velod_open" : "velod_closed") : "velod"),
      hasFall(v) ? raw(v, "mod_eg") : null);
    const s = app.motion.strike(Math.max(1, e.velocity) / 127, times.attack, times.decay);
    const walk = walkSeconds(times.attack, times.decay);
    run = { s, t0: null, walk, fall: times.fall, end: Math.max(walk, times.attack + times.decay) };
  });

  const off = app.motion.subscribe((_dt, now) => {
    setT(now);
    if (!run) return;
    run.t0 ??= now;
    const el = now - run.t0;
    const g = run.s.get();
    if (el >= run.end) {
      run = null;
      setGlow(0); setWalk(null); setFall(0);
      return;
    }
    setGlow(Math.min(1, g));
    setWalk(Math.min(1, el / run.walk));
    setFall(run.fall > 0 ? Math.max(0, 1 - el / run.fall) : 0);
  });

  createEffect(() => app.settings.state.pauseMotion, (p) => app.motion.setPaused(p));
  onCleanup(() => { off(); offStrike(); });
  return { t, glow, walk, fall };
}

// The single animation loop of the page (design 4.12.10). Time based, never frame based.
// The clock, requestAnimationFrame, matchMedia and the document are injected so tests are
// deterministic.

export const TAU = 0.12; // seconds
export const MAX_DT = 1 / 30; // seconds
export const SNAP = 0.02;
export const MIN_RISE = 0.05; // seconds, design: rise of at least 50 ms

/** One follow step: exact for any dt, so ten 10 ms steps equal one 100 ms step. */
export function followStep(x: number, target: number, dt: number): number {
  return x + (target - x) * (1 - Math.exp(-dt / TAU));
}

export interface MotionEnv {
  now(): number; // milliseconds
  raf(cb: () => void): number;
  caf(id: number): void;
  matchMedia?(q: string): { matches: boolean; addEventListener?(t: "change", cb: () => void): void };
  doc?: { hidden: boolean; addEventListener(t: "visibilitychange", cb: () => void): void };
}

export interface Follower {
  readonly value: number;
  readonly target: number;
  set(target: number): void;
  dispose(): void;
}

export interface Strike {
  /** Envelope value 0..velocity at the current clock time. */
  get(): number;
  readonly done: boolean;
}

export interface Motion {
  follower(initial: number, onChange?: (v: number) => void): Follower;
  /** Ambient callback, called every frame while ambient motion is allowed. Returns unsubscribe. */
  subscribe(cb: (dt: number, t: number) => void): () => void;
  /** Linear rise (at least 50 ms) to velocity (0..1), then linear fall over decay seconds. */
  strike(velocity: number, attack: number, decay: number): Strike;
  setPaused(p: boolean): void;
  readonly running: boolean;
  readonly reduced: boolean;
}

export function createMotion(env: MotionEnv): Motion {
  const followers = new Set<FollowerImpl>();
  const subs = new Set<(dt: number, t: number) => void>();
  const strikes = new Set<StrikeImpl>();
  let paused = false;
  let reduced = false;
  let id: number | null = null;
  let last = 0;

  const mq = env.matchMedia?.("(prefers-reduced-motion: reduce)");
  reduced = mq?.matches ?? false;
  const hidden = () => env.doc?.hidden ?? false;

  class FollowerImpl implements Follower {
    value: number;
    target: number;
    constructor(v: number, readonly onChange?: (v: number) => void) {
      this.value = v;
      this.target = v;
    }
    set(t: number) {
      this.target = t;
      if (reduced) {
        this.value = t;
        this.onChange?.(t);
        return;
      }
      schedule();
    }
    dispose() {
      followers.delete(this);
    }
  }

  class StrikeImpl implements Strike {
    done = false;
    private start = env.now();
    constructor(private v: number, private rise: number, private decay: number) {}
    get(): number {
      const t = (env.now() - this.start) / 1000;
      if (t >= this.rise + this.decay) {
        this.done = true;
        return 0;
      }
      return t < this.rise ? (this.v * t) / this.rise : this.v * (1 - (t - this.rise) / this.decay);
    }
  }

  const ambient = () => !paused && !reduced && !hidden();
  const needsLoop = () => {
    if (hidden()) return false;
    for (const f of followers) if (f.value !== f.target) return true;
    if (!paused && !reduced) return subs.size > 0 || strikes.size > 0;
    return false;
  };

  function schedule() {
    if (id === null && needsLoop()) {
      last = env.now();
      id = env.raf(frame);
    }
  }
  function stop() {
    if (id !== null) env.caf(id);
    id = null;
  }

  function frame() {
    id = null;
    const t = env.now();
    const dt = Math.min(Math.max((t - last) / 1000, 0), MAX_DT);
    last = t;
    for (const f of followers) {
      if (f.value === f.target) continue;
      f.value = Math.abs(f.target - f.value) < SNAP ? f.target : followStep(f.value, f.target, dt);
      if (Math.abs(f.target - f.value) < SNAP) f.value = f.target;
      f.onChange?.(f.value);
    }
    if (ambient()) {
      for (const s of strikes) if (s.get() === 0 && s.done) strikes.delete(s);
      for (const cb of [...subs]) cb(dt, t / 1000);
    }
    schedule();
  }

  function reevaluate() {
    if (reduced) {
      for (const f of followers) {
        if (f.value !== f.target) {
          f.value = f.target;
          f.onChange?.(f.value);
        }
      }
    }
    if (needsLoop()) schedule();
    else stop();
  }

  mq?.addEventListener?.("change", () => {
    reduced = mq.matches;
    reevaluate();
  });
  env.doc?.addEventListener("visibilitychange", reevaluate);

  return {
    follower(initial, onChange) {
      const f = new FollowerImpl(initial, onChange);
      followers.add(f);
      return f;
    },
    subscribe(cb) {
      subs.add(cb);
      schedule();
      return () => {
        subs.delete(cb);
        if (!needsLoop()) stop();
      };
    },
    strike(velocity, attack, decay) {
      const s = new StrikeImpl(velocity, Math.max(attack, MIN_RISE), Math.max(decay, 0));
      if (!reduced) {
        strikes.add(s);
        schedule();
      } else s.done = true;
      return reduced ? { get: () => 0, done: true } : s;
    },
    setPaused(p) {
      paused = p;
      reevaluate();
    },
    get running() {
      return id !== null;
    },
    get reduced() {
      return reduced;
    },
  };
}

/** The page's loop on the real browser objects (timers stand in where rAF or matchMedia are missing, as in jsdom). */
export function browserEnv(): MotionEnv {
  const hasRaf = typeof requestAnimationFrame === "function";
  return {
    now: () => performance.now(),
    raf: (cb) => (hasRaf ? requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number)),
    caf: (i) => (hasRaf ? cancelAnimationFrame(i) : clearTimeout(i)),
    matchMedia: typeof matchMedia === "function" ? (q) => matchMedia(q) : undefined,
    doc: document,
  };
}

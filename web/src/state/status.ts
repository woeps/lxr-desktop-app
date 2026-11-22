import { createContext, createSignal, flush, useContext } from "solid-js";
import type { Clock } from "../midi/sender";

export const SUCCESS_MS = 5000;

export interface Status {
  kind: "success" | "info" | "error" | "note";
  text: string;
  action?: { label: string; run: () => void };
}

export interface StatusStore {
  current(): Status | null;
  /** Replace the message. Only `success` clears itself, after 5 s, unless paused. */
  say(s: Status): void;
  dismiss(): void;
  /** Pointer or focus entered the strip: stop the clock. */
  pause(): void;
  /** Pointer and focus left the strip: a fresh 5 s starts. */
  resume(): void;
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createStatus(clock: Clock = realClock): StatusStore {
  const [current, set] = createSignal<Status | null>(null);
  const setCurrent = (v: Status | null) => { set(v); flush(); };
  let timer: unknown = null;
  let paused = false;
  const stop = () => { if (timer !== null) { clock.clearTimeout(timer); timer = null; } };
  const start = () => {
    stop();
    const c = current();
    if (c?.kind === "success" && !paused) timer = clock.setTimeout(() => { timer = null; setCurrent(null); }, SUCCESS_MS);
  };
  return {
    current,
    say(s) { setCurrent(s); start(); },
    dismiss() { stop(); setCurrent(null); },
    pause() { paused = true; stop(); },
    resume() { paused = false; start(); },
  };
}

export const StatusContext = createContext<StatusStore | null>(null);

export function useStatus(): StatusStore {
  const s = useContext(StatusContext);
  if (!s) throw new Error("useStatus outside StatusContext");
  return s;
}

import { PARAMS } from "../generated/params";
import type { Values } from "../model/sound";
import { encodeParam, type Bytes, type MidiSetup } from "./encode";

/** Output port: `send(bytes, t)` hands the bytes to the browser to go out at clock time `t` (ms). */
export interface Output {
  send(bytes: Bytes, t: number): void;
}

/** Injected time source (design 4.6): `performance.now()` and `setTimeout` in the page, a fake in tests. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** 320 us per byte at 31250 baud plus 15 % margin. */
export const BYTE_MS = 0.376;
/** Minimum spacing of two emissions of one parameter (R3.4). */
export const PARAM_SPACING_MS = 10;
/** The sender schedules at most this far ahead of the clock. */
export const LOOKAHEAD_MS = 30;

interface Entry { key: string; bytes: Bytes; transferId?: number }

export interface Transfer { sent: number; total: number }

export interface Sender {
  /** Queue a parameter value; replaces a queued, unsent value of the same parameter in place. */
  setParam(id: number, value: number): void;
  /** Queue any other message under its own key (`s` for store, `n:<seq>` for notes); never coalesced with other keys. */
  enqueue(key: string, bytes: Bytes): void;
  /** Queue every parameter of `sound` in id order as one transfer. */
  sendTransfer(values: Values): void;
  /** Drop the current transfer's unsent entries. What the browser already holds still goes out. */
  cancel(): void;
  /** True while anything is queued or scheduled ahead of the clock. */
  pending(): boolean;
  /** Progress of the latest transfer, or null when none was started. */
  transfer(): Transfer | null;
  /** Called after the bytes of a parameter were handed to the output (row flash). Returns unsubscribe. */
  onHandedOff(fn: (id: number) => void): () => void;
  /** Called whenever pending() or transfer() may have changed. Returns unsubscribe. */
  onChange(fn: () => void): () => void;
}

/**
 * Paced FIFO sender (design 4.6). Without an output the entries are dropped.
 * shortcut: no Solid signals here, getters plus onChange; wrap them in a signal in state/session.ts.
 */
export function createSender(getOutput: () => Output | null, getSetup: () => MidiSetup, clock: Clock): Sender {
  let queue: Entry[] = [];
  const lastEmit = new Map<string, number>();
  let cursor = 0; // clock time at which the output is free again
  let timer: unknown = null;
  let nextTransfer = 1;
  let activeTransfer = 0;
  let progress: Transfer | null = null;
  const handed = new Set<(id: number) => void>();
  const changed = new Set<() => void>();
  const emitChange = () => changed.forEach((f) => f());
  const keyOf = (id: number) => `p:${id}`;

  function arm(ms: number): void {
    if (timer !== null) clock.clearTimeout(timer);
    timer = clock.setTimeout(pump, Math.max(0, ms));
  }

  function pump(): void {
    timer = null;
    const now = clock.now();
    const out = getOutput();
    if (!out) {
      queue = [];
      progress = null;
      emitChange();
      return;
    }
    let wake = Infinity;
    for (;;) {
      // first entry in FIFO order whose per-key spacing allows it
      let pick = -1;
      let at = Infinity;
      for (let i = 0; i < queue.length; i++) {
        const e = queue[i]!;
        const t = Math.max(cursor, now, (lastEmit.get(e.key) ?? -Infinity) + PARAM_SPACING_MS);
        if (t <= now + LOOKAHEAD_MS) { pick = i; at = t; break; }
        wake = Math.min(wake, t - LOOKAHEAD_MS);
      }
      if (pick < 0) break;
      const e = queue.splice(pick, 1)[0]!;
      out.send(e.bytes, at);
      lastEmit.set(e.key, at);
      cursor = at + e.bytes.length * BYTE_MS;
      if (e.transferId === activeTransfer && progress) progress.sent++;
      if (e.key.startsWith("p:")) { const id = Number(e.key.slice(2)); handed.forEach((f) => f(id)); }
    }
    if (queue.length > 0) arm(wake - now);
    else if (cursor > now) arm(cursor - now); // idle notice once the scheduled bytes are out
    emitChange();
  }

  function put(entry: Entry): void {
    const same = queue.find((e) => e.key === entry.key);
    if (same) {
      same.bytes = entry.bytes;
      if (entry.transferId !== undefined) same.transferId = entry.transferId;
    } else queue.push(entry);
  }

  return {
    setParam(id, value) {
      const p = PARAMS.find((d) => d.id === id);
      if (!p) return;
      put({ key: keyOf(id), bytes: encodeParam(getSetup(), p, value) });
      pump();
    },
    enqueue(key, bytes) {
      put({ key, bytes });
      pump();
    },
    sendTransfer(values) {
      const transferId = nextTransfer++;
      activeTransfer = transferId;
      for (const p of PARAMS) put({ key: keyOf(p.id), bytes: encodeParam(getSetup(), p, values[p.id] ?? 0), transferId });
      progress = { sent: 0, total: queue.filter((e) => e.transferId === transferId).length };
      pump();
    },
    cancel() {
      queue = queue.filter((e) => e.transferId !== activeTransfer);
      activeTransfer = 0;
      pump();
    },
    pending: () => queue.length > 0 || clock.now() < cursor,
    transfer: () => (progress ? { ...progress } : null),
    onHandedOff(fn) { handed.add(fn); return () => handed.delete(fn); },
    onChange(fn) { changed.add(fn); return () => changed.delete(fn); },
  };
}

/** Clock backed by the page's timers. */
export const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

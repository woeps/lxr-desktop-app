import { createContext, createSignal, flush, useContext } from "solid-js";
import { createMidiConnection, type MidiConnection, type MidiEnv } from "../midi/access";
import { encodeNote, encodePanic, NOTE_OFF_DELAY_MS } from "../midi/encode";
import { createSender, realClock, type Clock, type Sender, type Transfer } from "../midi/sender";
import type { Rng } from "../model/sound";
import { browserEnv, createMotion, type Motion, type MotionEnv } from "../visual/motion";
import { createLibrary, type Library } from "./library";
import { createSession, type Session } from "./session";
import { createSettings, SLOTS, type SettingsStore } from "./settings";

export interface AppDeps {
  storage: Storage;
  env: MidiEnv;
  clock: Clock;
  rng: Rng;
  /** Animation loop environment; tests inject a fake, the page uses the browser's. */
  motionEnv?: MotionEnv;
}

/** A strike the page has just sent (slot 0..6, velocity 1..127). */
export interface StrikeEvent { slot: number; velocity: number }

/** Everything the page shell shares: the session plus the MIDI side (settings, connection, sender, audition). */
export interface App {
  session: Session;
  settings: SettingsStore;
  library: Library;
  conn: MidiConnection;
  sender: Sender;
  /** Reactive: reads of the connection and sender go through this so components update. */
  rev(): number;
  hasOutput(): boolean;
  pending(): boolean;
  progress(): Transfer | null;
  /** True while a transfer is running: triggering is blocked (R3.9). */
  busy(): boolean;
  /** Note on now, note off after NOTE_OFF_DELAY_MS, for voice slot 0..6 (R4.1). */
  strike(slot: number, velocity?: number): void;
  /** Every slot once, in voice order (R4.4). */
  playAll(): void;
  /** Note off for every note still held (R4.5). */
  panic(): void;
  /** Send every parameter (R3.8). */
  sendAll(): void;
  rng: Rng;
  /** The page's single animation loop (design 4.12.10). */
  motion: Motion;
  /** Called on every strike that is sent; returns the unsubscribe function. */
  onStrike(cb: (e: StrikeEvent) => void): () => void;
}

export function defaultDeps(): AppDeps {
  return {
    storage: localStorage,
    env: {
      isSecureContext: window.isSecureContext,
      requestMIDIAccess: typeof navigator.requestMIDIAccess === "function"
        ? (o) => navigator.requestMIDIAccess(o) as never : undefined,
    },
    clock: realClock,
    rng: Math.random,
  };
}

export function createApp(deps: AppDeps = defaultDeps()): App {
  const { storage, env, clock, rng } = deps;
  const motion = createMotion(deps.motionEnv ?? browserEnv());
  const strikeListeners = new Set<(e: StrikeEvent) => void>();
  const [rev, setRev] = createSignal(0);
  const bump = () => { setRev((n) => n + 1); flush(); };

  const settings = createSettings(storage);
  const conn = createMidiConnection(env, storage, clock, settings.midiSetup);
  const sender = createSender(conn.output, settings.midiSetup, clock);
  const hasOutput = () => conn.output() !== null;
  const session = createSession({ storage, clock, sender, hasOutput });
  const library = createLibrary(storage);

  let lastOutput = conn.selected()?.id ?? null;
  conn.onChange(() => {
    const id = conn.selected()?.id ?? null;
    if (id !== lastOutput) {
      lastOutput = id;
      if (id) session.setModuleInSync(false); // a fresh connect: the module may differ (design 4.6)
    }
    bump();
  });
  sender.onChange(() => {
    const t = sender.transfer();
    if (t && t.sent === t.total && !session.state.moduleInSync && hasOutput()) session.setModuleInSync(true);
    bump();
  });

  const held = new Map<string, { channel: number; note: number }>();
  let seq = 0;

  function strike(slot: number, velocity?: number): void {
    if (busy() || !hasOutput()) return;
    const vel = velocity ?? settings.state.velocity;
    const n = encodeNote(settings.midiSetup(), slot, vel, settings.state.pitch);
    for (const cb of [...strikeListeners]) cb({ slot, velocity: vel });
    const key = `${n.channel}:${n.note}`;
    const id = ++seq;
    sender.enqueue(`n:${id}`, n.on);
    held.set(key, { channel: n.channel, note: n.note });
    clock.setTimeout(() => {
      if (!held.delete(key)) return; // panic already released it
      sender.enqueue(`n:${id}o`, n.off);
    }, NOTE_OFF_DELAY_MS);
  }

  const busy = (): boolean => {
    rev();
    const t = sender.transfer();
    return sender.pending() && t !== null && t.sent < t.total;
  };

  return {
    session, settings, library, conn, sender, rng, motion,
    onStrike(cb) { strikeListeners.add(cb); return () => { strikeListeners.delete(cb); }; },
    rev: () => rev(),
    hasOutput: () => { rev(); return hasOutput(); },
    pending: () => { rev(); return sender.pending(); },
    progress: () => { rev(); return sender.transfer(); },
    busy,
    strike,
    playAll() { for (let slot = 0; slot < SLOTS; slot++) strike(slot); },
    panic() {
      for (const bytes of encodePanic(held.values())) sender.enqueue(`n:${++seq}p`, bytes);
      held.clear();
    },
    sendAll() {
      if (!hasOutput()) return;
      sender.sendTransfer(session.state.current.values);
    },
  };
}

export const AppContext = createContext<App>();

export function useApp(): App {
  const a = useContext(AppContext);
  if (!a) throw new Error("useApp outside AppContext");
  return a;
}

import { createContext, createSignal, flush, useContext } from "solid-js";
import { createMidiConnection, type MidiConnection, type MidiEnv } from "../midi/access";
import { encodeNote, encodePanic, encodeStore, NOTE_OFF_DELAY_MS } from "../midi/encode";
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
  /** Hero walk fraction 0..1 (sent / total) while a transfer runs, else null (design 4.12.10). */
  transferWalk(): number | null;
  /** True after the user cancelled the latest transfer, until the next one starts (R6.3). */
  cancelled(): boolean;
  /** True while Store is not allowed: sending, a full transfer ahead of the store, or within STORE_GAP_MS of the last one (R7.9, R7.11). */
  storeBlocked(): boolean;
  /** True while the store waits for its full transfer to finish (R7.10). */
  storeWaiting(): boolean;
  /** Time of day (ms since epoch) the latest store command was handed to the sender, or null. */
  storedAt(): number | null;
  /** Send the full sound first when the module may differ, then the store command, as one action (R7.10). */
  store(): void;
  /** Send a sound other than the current one in full (R7.5). The module then differs from the page's sound. */
  sendSound(values: Uint8Array): void;
  /** Stop the running transfer: the module now holds a mix of old and new sounds. */
  cancelTransfer(): void;
  /** Called when a parameter is handed to the output during a transfer (row flash). */
  onFlash(cb: (id: number) => void): () => void;
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

/** At most one store command per this many ms (R7.11). */
export const STORE_GAP_MS = 2000;

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
  let transferring = false;
  const [cancelled, setCancelled] = createSignal(false);
  const flashListeners = new Set<(id: number) => void>();
  sender.onHandedOff((id) => { if (transferring) flashListeners.forEach((f) => f(id)); });
  // Every full transfer, from Send all or from loading a sound, starts here.
  let foreign = false; // the running transfer carries a sound that is not the page's current one
  const startTransfer: Sender["sendTransfer"] = (values) => {
    foreign = false;
    transferring = true;
    setCancelled(false);
    sender.sendTransfer(values);
  };
  let waitingStore = false;
  let lastStoreClock: number | null = null;
  let lastStoreWall: number | null = null;
  function sendStore(): void {
    waitingStore = false;
    lastStoreClock = clock.now();
    lastStoreWall = Date.now();
    sender.enqueue("s", encodeStore(settings.midiSetup()));
    clock.setTimeout(bump, STORE_GAP_MS); // re-enable the button once the gap has passed
  }
  const session = createSession({ storage, clock, sender: { setParam: sender.setParam, sendTransfer: startTransfer }, hasOutput });
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
    const done = transferring && t !== null && t.sent === t.total;
    if (done) transferring = false;
    if (waitingStore && !hasOutput()) waitingStore = false;
    else if (done && waitingStore) sendStore();
    if (t && t.sent === t.total && !foreign && !session.state.moduleInSync && hasOutput()) session.setModuleInSync(true);
    bump();
    if (done && settings.state.auditionAfterSend) {
      const page = session.state.page;
      strike(typeof page === "number" ? page : 0); // R6.4: the current voice; the Cauldron strikes drum 1
    }
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

  const transferWalk = (): number | null => {
    rev();
    const t = sender.transfer();
    return transferring && t && t.sent < t.total && !motion.reduced ? t.sent / t.total : null;
  };

  const storeBlocked = (): boolean => {
    rev();
    return !hasOutput() || sender.pending() || waitingStore
      || (lastStoreClock !== null && clock.now() < lastStoreClock + STORE_GAP_MS);
  };

  return {
    session, settings, transferWalk,
    storeBlocked,
    storeWaiting: () => { rev(); return waitingStore; },
    storedAt: () => { rev(); return lastStoreWall; },
    store() {
      if (storeBlocked()) return;
      if (session.state.moduleInSync) { sendStore(); bump(); return; }
      waitingStore = true;
      startTransfer(session.state.current.values);
      bump();
    },
    cancelled: () => cancelled(),
    sendSound(values) {
      if (!hasOutput()) return;
      startTransfer(values);
      foreign = true;
      session.setModuleInSync(false);
    },
    cancelTransfer() {
      if (!transferring) return;
      transferring = false;
      waitingStore = false;
      sender.cancel();
      setCancelled(true);
      session.setModuleInSync(false);
      bump();
    },
    onFlash(cb) { flashListeners.add(cb); return () => { flashListeners.delete(cb); }; }, library, conn, sender, rng, motion,
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
      startTransfer(session.state.current.values);
    },
  };
}

export const AppContext = createContext<App | null>(null);

export function useApp(): App {
  const a = useContext(AppContext);
  if (!a) throw new Error("useApp outside AppContext");
  return a;
}

import { randomise } from "../model/sound";
import { PAGES, voiceOf } from "../components/voices";
import type { App } from "./app";

type RollApp = Pick<App, "session" | "rng">;

/** Randomise one voice by `amount` percent; locked parameters stay. One undo step. */
export function rollVoice(app: RollApp, voice: ReturnType<typeof voiceOf>, amount: number): void {
  const { session, rng } = app;
  session.applyChanges(randomise(session.state.current, voice, amount / 100, new Set(session.state.locked), rng));
}

/** Randomise every voice and the FX bus by `amount` percent; locked parameters stay. One undo step. */
export function rollAll(app: RollApp, amount: number): void {
  const { session, rng } = app;
  const locked = new Set(session.state.locked);
  session.applyChanges(PAGES.flatMap((p) => randomise(session.state.current, voiceOf(p.page), amount / 100, locked, rng)));
}

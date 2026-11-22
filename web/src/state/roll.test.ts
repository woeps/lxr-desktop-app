import { beforeEach, describe, expect, it } from "vitest";
import { PARAMS } from "../generated/params";
import { factory } from "../model/sound";
import { createSession } from "./session";
import { rollAll, rollVoice } from "./roll";

beforeEach(() => localStorage.clear());

function make() {
  const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} };
  const session = createSession({
    storage: localStorage, clock, hasOutput: () => true, sender: { setParam: () => {}, sendTransfer: () => {} },
  });
  let n = 0;
  const rng = () => ((n = (n * 7919 + 13) % 1000) + 0.5) / 1000;
  return { session, rng };
}

describe("roll", () => {
  it("rollAll is one undo step and undo restores the sound", () => {
    const app = make();
    rollAll(app, 100);
    expect(app.session.state.current.values).not.toEqual(factory().values);
    app.session.undo();
    expect(app.session.state.current.values).toEqual(factory().values);
    expect(app.session.history.canUndo()).toBe(false);
  });

  it("rollVoice is one undo step, touches only that voice", () => {
    const app = make();
    rollVoice(app, 0, 100);
    const now = app.session.state.current.values;
    const changed = PARAMS.filter((p) => now[p.id] !== factory().values[p.id]);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((p) => p.voice === 0)).toBe(true);
    app.session.undo();
    expect(app.session.state.current.values).toEqual(factory().values);
    expect(app.session.history.canUndo()).toBe(false);
  });

  it("locked parameters keep their value in both rolls", () => {
    const app = make();
    const d0 = PARAMS.filter((p) => p.voice === 0 && !p.mix && !p.inert);
    d0.forEach((p) => app.session.toggleLock(p.id));
    rollVoice(app, 0, 100);
    rollAll(app, 100);
    for (const p of d0) expect(app.session.state.current.values[p.id]).toBe(factory().values[p.id]);
    expect(PARAMS.some((p) => app.session.state.current.values[p.id] !== factory().values[p.id])).toBe(true);
  });

  it("amount 0 changes nothing", () => {
    const app = make();
    rollAll(app, 0);
    expect(app.session.history.canUndo()).toBe(false);
  });
});

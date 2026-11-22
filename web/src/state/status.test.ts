import { describe, expect, it } from "vitest";
import { createStatus, SUCCESS_MS } from "./status";
import type { Clock } from "../midi/sender";

function make() {
  let t = 0;
  let timers: { at: number; fn: () => void }[] = [];
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => { const h = { at: t + ms, fn }; timers.push(h); return h; },
    clearTimeout: (h) => { timers = timers.filter((x) => x !== h); },
  };
  const advance = (ms: number) => {
    t += ms;
    const due = timers.filter((x) => x.at <= t);
    timers = timers.filter((x) => x.at > t);
    due.forEach((x) => x.fn());
  };
  return { status: createStatus(clock), advance };
}

describe("status", () => {
  it("a success message clears after 5 s", () => {
    const { status, advance } = make();
    status.say({ kind: "success", text: "Saved" });
    advance(SUCCESS_MS - 1);
    expect(status.current()?.text).toBe("Saved");
    advance(1);
    expect(status.current()).toBeNull();
  });

  it("pause holds it, resume restarts the 5 s", () => {
    const { status, advance } = make();
    status.say({ kind: "success", text: "Saved" });
    status.pause();
    advance(60_000);
    expect(status.current()?.text).toBe("Saved");
    status.resume();
    advance(SUCCESS_MS - 1);
    expect(status.current()).not.toBeNull();
    advance(1);
    expect(status.current()).toBeNull();
  });

  it("a success said while paused waits for resume", () => {
    const { status, advance } = make();
    status.pause();
    status.say({ kind: "success", text: "A" });
    advance(10_000);
    expect(status.current()?.text).toBe("A");
    status.resume();
    advance(SUCCESS_MS);
    expect(status.current()).toBeNull();
  });

  it("errors, info and notes persist; a new message replaces the old one and its timer", () => {
    const { status, advance } = make();
    for (const kind of ["error", "info", "note"] as const) {
      status.say({ kind, text: kind });
      advance(60_000);
      expect(status.current()?.text).toBe(kind);
    }
    status.say({ kind: "success", text: "ok" });
    status.say({ kind: "error", text: "bad" });
    advance(SUCCESS_MS * 2);
    expect(status.current()?.text).toBe("bad");
    status.dismiss();
    expect(status.current()).toBeNull();
  });
});

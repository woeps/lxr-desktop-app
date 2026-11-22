import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { App } from "../App";
import { createApp, type App as AppState } from "../state/app";

let host: HTMLElement;
let dispose: () => void;
let app: AppState;
let out: number[][];
let now: number;
let timers: { at: number; fn: () => void; id: number }[];
let nextId: number;

/** Fake clock: `advance(ms)` runs due timers in order. */
function advance(ms: number) {
  const end = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    timers = timers.filter((t) => t !== due);
    now = Math.max(now, due.at);
    due.fn();
  }
  now = end;
  flush();
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); flush(); };
const btn = (name: string) => [...host.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent!.trim().startsWith(name))!;
const click = (el: Element) => { (el as HTMLElement).click(); flush(); };
const q = (s: string) => host.querySelector<HTMLElement>(s);

beforeEach(async () => {
  localStorage.clear();
  out = []; timers = []; now = 0; nextId = 1;
  const clock = {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => { const id = nextId++; timers.push({ at: now + ms, fn, id }); return id; },
    clearTimeout: (h: unknown) => { timers = timers.filter((t) => t.id !== h); },
  };
  const port = { id: "p1", name: "Fake out", send: (d: number[]) => { out.push(d); } };
  const env = { isSecureContext: true, requestMIDIAccess: async () => ({ outputs: { values: () => [port] }, onstatechange: null }) };
  app = createApp({ storage: localStorage, env, clock, rng: () => 0.5, motionEnv: { now: () => now, raf: () => 1, caf: () => {}, matchMedia: () => ({ matches: false }) } });
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <App app={app} />, host);
  flush();
  click(host.querySelector("[data-connection-pill]")!);
  click(btn("Connect"));
  await tick();
  out.length = 0;
});
afterEach(() => { dispose(); host.remove(); });

describe("TransferStatus", () => {
  it("shows progress while sending, then the completion note", () => {
    click(btn("Send all"));
    const total = app.progress()!.total;
    expect(q("[data-testid=transfer-count]")!.textContent).toMatch(new RegExp(`/ ${total}$`));
    expect(btn("Cancel")).toBeTruthy();
    expect(app.transferWalk()).not.toBeNull();
    advance(5000);
    expect(q("[data-testid=transfer-count]")!.textContent).toBe(`${total} / ${total}`);
    expect(btn("Cancel")).toBeUndefined();
    expect(q("[data-testid=transfer-note]")!.textContent).toContain("cannot be confirmed");
    expect(app.transferWalk()).toBeNull();
  });

  it("Cancel stops the transfer, says so and offers Send again", () => {
    click(btn("Send all"));
    advance(50);
    const sentBefore = app.progress()!.sent;
    click(btn("Cancel"));
    advance(5000);
    expect(app.progress()!.sent).toBeLessThan(app.progress()!.total);
    expect(app.progress()!.sent).toBeGreaterThanOrEqual(sentBefore);
    expect(q("[data-testid=transfer-note]")!.textContent).toBe("Module holds a mix of the old and new sound.");
    expect(btn("Cancel")).toBeUndefined();
    expect(app.session.state.moduleInSync).toBe(false);
    click(btn("Send again"));
    advance(5000);
    expect(app.progress()!.sent).toBe(app.progress()!.total);
    expect(btn("Send again")).toBeUndefined();
  });

  it("flashes a row once when its value is handed over, and only during a transfer", () => {
    const row = q("[data-param]")!;
    expect(row.dataset.flash).toBeUndefined();
    click(btn("Send all"));
    advance(5000);
    expect(["0", "1"]).toContain(row.dataset.flash);
  });

  it("strikes the current voice after a completed transfer only when Audition after send is on", () => {
    click(btn("Send all"));
    advance(5000);
    const notes = () => out.filter((m) => (m[0]! & 0xf0) === 0x90);
    expect(notes()).toHaveLength(0);
    app.settings.set({ auditionAfterSend: true });
    out.length = 0;
    click(btn("Send all"));
    advance(5000);
    expect(notes()).toHaveLength(1);
  });

  it("does not audition after a cancelled transfer", () => {
    app.settings.set({ auditionAfterSend: true });
    click(btn("Send all"));
    advance(50);
    click(btn("Cancel"));
    advance(5000);
    expect(out.filter((m) => (m[0]! & 0xf0) === 0x90)).toHaveLength(0);
  });
});

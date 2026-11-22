import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { PARAMS } from "./generated/params";
import { App } from "./App";
import { createApp, type App as AppState } from "./state/app";
import { MSG_UNSUPPORTED, type MidiEnv } from "./midi/access";

// The real App, with a fake Web MIDI access and a manual clock.
let host: HTMLElement;
let dispose: () => void;
let app: AppState;
let out: number[][];
let timers: { fn: () => void; at: number }[];
let now = 0;

const STORE_BYTES = [0xb0, 0x63, 0x7e, 0xb0, 0x62, 0x00, 0xb0, 0x06, 0x53, 0xb0, 0x63, 0x7f, 0xb0, 0x62, 0x7f];

function advance(ms: number) {
  const end = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    timers.splice(timers.indexOf(due), 1);
    now = Math.max(now, due.at);
    due.fn();
    flush();
  }
  now = end;
  flush();
}

function mount(env: MidiEnv) {
  out = []; timers = []; now = 0;
  const clock = {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => { const t = { fn, at: now + ms }; timers.push(t); return t; },
    clearTimeout: (h: unknown) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1); },
  };
  app = createApp({ storage: localStorage, env, clock, rng: () => 0.9 });
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <App app={app} />, host);
  flush();
}
const fakeEnv = () => {
  const port = { id: "p1", name: "Fake out", send: (d: number[]) => { out.push(d); } };
  return { isSecureContext: true, requestMIDIAccess: async () => ({ outputs: { values: () => [port] }, onstatechange: null }) };
};
const tick = async () => { await Promise.resolve(); await Promise.resolve(); flush(); };
const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent!.trim().startsWith(name))!;
const click = (el: Element) => { (el as HTMLElement).click(); flush(); };
const tab = (name: string) => host.querySelector<HTMLElement>(`[role=tab][aria-label="${name}"]`)!;
const connect = async () => { click(button("Connect")); await tick(); advance(0); out.length = 0; };

beforeEach(() => localStorage.clear());
afterEach(() => { dispose(); host.remove(); });

describe("the page end to end, with a fake MIDI access", () => {
  it("connects, shows the output, and moving a bar sends its CC", async () => {
    mount(fakeEnv());
    await connect();
    expect(host.textContent).toContain("Fake out");
    const p = PARAMS.find((x) => x.voice === 0 && x.kind === "num" && "cc" in x.addr && x.def < x.max && !x.inert)!;
    const bar = host.querySelector<HTMLElement>(`[data-param=${p.name}] [role=slider]`)!;
    expect(bar).toBeTruthy();
    bar.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    flush();
    advance(100);
    expect(app.session.state.current.values[p.id]).toBe(p.def + 1);
    const cc = out.filter((m) => m.length === 3 && m[1] === (p.addr as { cc: number }).cc);
    expect(cc.length).toBeGreaterThan(0);
    expect(cc.at(-1)![0] & 0xf0).toBe(0xb0);
    expect(cc.at(-1)![2]).toBe(p.def + 1);
  });

  it("seals into the boot slot: the full transfer, then the store command", async () => {
    mount(fakeEnv());
    await connect();
    click(button("Seal into boot slot"));
    expect(host.querySelector("[role=dialog]")).toBeTruthy();
    click(button("Confirm store"));
    advance(3000);
    expect(out.length).toBeGreaterThan(PARAMS.length / 2);
    expect(out.flat().slice(-15)).toEqual(STORE_BYTES);
    expect(out.filter((m) => m.length === 15)).toHaveLength(1);
    expect(host.querySelector("[data-testid=store-status]")!.textContent).toMatch(/Store command sent/);
  });

  it("switches voice", () => {
    mount(fakeEnv());
    const first = () => [...host.querySelectorAll<HTMLElement>("[data-param]")].map((e) => e.dataset.param!);
    const before = first();
    click(tab("Snare"));
    expect(tab("Snare").getAttribute("aria-selected")).toBe("true");
    expect(tab("Drum 1").getAttribute("aria-selected")).toBe("false");
    expect(first()).not.toEqual(before);
  });

  it("picks a target for the Mentor by clicking a row", () => {
    mount(fakeEnv());
    const pick = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent!.trim() === "pick")!;
    click(pick);
    expect(app.session.state.pick).toBeTruthy();
    const mentor = PARAMS.find((p) => p.name === "target_lfo1")!;
    const before = app.session.state.current.values[mentor.id];
    const row = host.querySelector<HTMLElement>("[data-pickable=true]")!;
    expect(row).toBeTruthy();
    click(row);
    expect(app.session.state.pick).toBeNull();
    expect(app.session.state.current.values[mentor.id]).not.toBe(before);
  });

  it("without Web MIDI it says so and still edits", async () => {
    mount({ isSecureContext: true });
    click(button("Connect"));
    await tick();
    expect(host.textContent).toContain(MSG_UNSUPPORTED);
    const p = PARAMS.find((x) => x.voice === 0 && x.kind === "num" && x.def < x.max && !x.inert)!;
    host.querySelector<HTMLElement>(`[data-param=${p.name}] [role=slider]`)!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    flush();
    expect(app.session.state.current.values[p.id]).toBe(p.def + 1);
  });
});

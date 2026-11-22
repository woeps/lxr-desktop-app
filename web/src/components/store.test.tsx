import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { App } from "../App";
import { createApp, type App as AppState } from "../state/app";
import { PARAMS } from "../generated/params";

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

async function mount() {
  out = []; timers = []; now = 0;
  const clock = {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => { const t = { fn, at: now + ms }; timers.push(t); return t; },
    clearTimeout: (h: unknown) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1); },
  };
  const port = { id: "p1", name: "Fake out", send: (d: number[]) => { out.push(d); } };
  const env = {
    isSecureContext: true,
    requestMIDIAccess: async () => ({ outputs: { values: () => [port] }, onstatechange: null }),
  };
  app = createApp({ storage: localStorage, env, clock, rng: () => 0.9 });
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <App app={app} />, host);
  flush();
  host.querySelector<HTMLElement>("[data-connection-pill]")!.click(); flush();
  const connect = [...host.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent!.trim() === "Connect")!;
  connect.click(); flush();
  await Promise.resolve(); await Promise.resolve(); flush();
  advance(0);
  out.length = 0;
}
const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent!.trim().startsWith(name))!;
const click = (el: Element) => { (el as HTMLElement).click(); flush(); };
const seal = () => { click(host.querySelector("[aria-label='Send options']")!); click(host.querySelector("[role=menuitem]")!); };
const storeCount = () => out.filter((m) => m.length === 15).length;

beforeEach(() => localStorage.clear());
afterEach(() => { dispose(); host.remove(); });

describe("StoreDialog", () => {

  it("opens from the toolbar and sends the full sound, then the store command, when not in sync", async () => {
    await mount();
    expect(app.session.state.moduleInSync).toBe(false);
    seal();
    expect(host.querySelector("[role=dialog]")).toBeTruthy();
    expect(host.querySelector("[data-testid=store-full-first]")).toBeTruthy();
    click(button("Confirm store"));
    expect(button("Confirm store").disabled).toBe(true);
    advance(2000);
    const flat = out.flat();
    expect(out.length).toBeGreaterThan(PARAMS.length / 2);
    expect(flat.slice(-15)).toEqual(STORE_BYTES);
    expect(storeCount()).toBe(1);
    expect(host.querySelector("[data-testid=store-status]")!.textContent).toMatch(/Store command sent at \d\d:\d\d:\d\d/);
    expect(host.querySelector("[data-testid=store-status]")!.textContent).toContain("cannot be confirmed");
  });

  it("sends only the store command when the module is in sync, then blocks for 2 s", async () => {
    await mount();
    click(button("Send all"));
    advance(2000);
    expect(app.session.state.moduleInSync).toBe(true);
    out.length = 0;
    seal();
    expect(host.querySelector("[data-testid=store-full-first]")).toBeNull();
    click(button("Confirm store"));
    advance(10);
    expect(out.flat()).toEqual(STORE_BYTES);
    expect(button("Confirm store").disabled).toBe(true);
    app.store(); // ignored inside the gap
    advance(1000);
    expect(out.flat()).toEqual(STORE_BYTES);
    expect(button("Confirm store").disabled).toBe(true);
    advance(1100);
    expect(button("Confirm store").disabled).toBe(false);
    click(button("Confirm store"));
    advance(10);
    expect(out.flat()).toEqual([...STORE_BYTES, ...STORE_BYTES]);
  });

  it("is disabled while a transfer is running and does not store after a cancel", async () => {
    await mount();
    seal();
    click(button("Send all"));
    expect(button("Confirm store").disabled).toBe(true);
    app.cancelTransfer();
    flush();
    advance(3000);
    expect(storeCount()).toBe(0);
    expect(button("Confirm store").disabled).toBe(false);
  });

  it("Close removes the dialog", async () => {
    await mount();
    seal();
    click(button("Close"));
    expect(host.querySelector("[role=dialog][aria-label='Seal into boot slot']")).toBeNull();
  });
});

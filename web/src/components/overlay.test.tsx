import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { AppContext, createApp } from "../state/app";
import { SessionContext } from "../state/session";
import { JourneyPage } from "./JourneyPage";
import { measure } from "./JourneyOverlay";

const ORDER = ["call", "hero", "threshold", "trials", "ordeal", "forge", "roadBack", "return", "mentor", "bindings", "oracle"];
const WIDTH = (s: string) => ({ return: 100, mentor: 300, bindings: 330, oracle: 240 })[s] ?? 132;
const proto = HTMLElement.prototype;
const saved = ["offsetLeft", "offsetTop", "offsetWidth", "offsetHeight"].map((k) => [k, Object.getOwnPropertyDescriptor(proto, k)] as const);

let host: HTMLElement;
let dispose: () => void;

/** Pretend layout: stations 172 px apart on one row at y 70, cards on a second row. */
function stubLayout() {
  const at = (el: HTMLElement) => ORDER.indexOf(el.dataset.station ?? "");
  const get = (f: (i: number, s: string) => number) => ({
    configurable: true,
    get(this: HTMLElement) { const i = at(this); return i < 0 ? 0 : f(i, ORDER[i]!); },
  });
  Object.defineProperties(proto, {
    offsetLeft: get((i) => (i < 8 ? i * 172 : [0, 344, 718][i - 8]!)),
    offsetTop: get((i) => (i < 8 ? 70 : 330)),
    offsetWidth: get((_i, s) => WIDTH(s)),
    offsetHeight: get(() => 200),
  });
}

async function mount(voice: 0 | 1 | 2 | 3 | 4 | 5) {
  const clock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };
  const app = createApp({ storage: localStorage, env: { isSecureContext: true } as never, clock, rng: () => 0.5 });
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(
    () => <AppContext value={app}><SessionContext value={app.session}><JourneyPage voice={voice} /></SessionContext></AppContext>,
    host,
  );
  flush();
  await Promise.resolve();
  flush();
}

beforeEach(() => { localStorage.clear(); stubLayout(); });
afterEach(() => {
  dispose(); host.remove();
  for (const [k, d] of saved) if (d) Object.defineProperty(proto, k, d); else delete (proto as unknown as Record<string, unknown>)[k];
});

describe("JourneyOverlay", () => {
  it("measures the boxes relative to the journey", async () => {
    await mount(0);
    const m = measure(host.querySelector<HTMLElement>("[data-journey]")!);
    expect(m.stations).toHaveLength(8);
    expect(m.cards).toHaveLength(3);
    expect(m.stations[2]).toEqual({ x: 344, y: 70, w: 132, h: 200 });
    expect(m.w).toBe(7 * 172 + 100);
  });
  it("draws one overlay with 8 seals, 8 landmarks and 7 bridges from the measured sizes", async () => {
    await mount(0);
    const svg = host.querySelectorAll("svg[data-overlay=journey]");
    expect(svg).toHaveLength(1);
    expect(svg[0]!.querySelectorAll("[data-seal]")).toHaveLength(8);
    expect(svg[0]!.querySelectorAll("[data-glyph]")).toHaveLength(8);
    expect(svg[0]!.querySelectorAll("[data-bridge]")).toHaveLength(7);
    expect(svg[0]!.getAttribute("width")).toBe(String(7 * 172 + 100));
    const seal3 = svg[0]!.querySelector("[data-seal='3']")!;
    expect(Number(seal3.getAttribute("x"))).toBe(344 + 66 - 14);
  });
  it("draws the chains between the cards on a row and the fall only on voices with a pitch envelope", async () => {
    for (const voice of [0, 1, 2, 3, 4, 5] as const) {
      await mount(voice);
      expect(host.querySelector("svg[data-overlay] [data-part=fall]") !== null).toBe(voice <= 3);
      expect(host.querySelectorAll("svg[data-overlay] [data-chain]")).toHaveLength(2);
      dispose(); host.remove();
    }
    await mount(0);
  });
});

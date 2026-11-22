import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { PARAMS } from "../generated/params";
import { AppContext, createApp, type App } from "../state/app";
import { SessionContext } from "../state/session";
import { targetIndex } from "../model/links";
import { hotFor } from "../model/caption";
import { JourneyPage } from "./JourneyPage";
import { Caption } from "./Caption";

const def = (name: string) => PARAMS.find((p) => p.name === name)!;
let host: HTMLElement;
let dispose: () => void;
let app: App;

async function mount(voice: 0 | 1 | 2 | 3 | 4 | 5 = 0) {
  const clock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };
  app = createApp({ storage: localStorage, env: { isSecureContext: true } as never, clock, rng: () => 0.5 });
  app.session.setPage(voice);
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(
    () => <AppContext value={app}><SessionContext value={app.session}><JourneyPage voice={voice} /><Caption /></SessionContext></AppContext>,
    host,
  );
  flush();
  await Promise.resolve();
  flush();
}
const bind = (name: string, targetName: string) => {
  const d = def(name);
  app.session.applyChanges([[d.id, d.def, d.min + targetIndex(def(targetName).id)]]);
  flush();
};
const row = (name: string) => host.querySelector<HTMLElement>(`[data-param=${name}]`)!;
const caption = () => host.querySelector("[data-part=caption]")!;
const hotBridges = () => [...host.querySelectorAll("[data-bridge][data-hot]")].map((g) => Number(g.getAttribute("data-bridge")));
const point = (name: string) => { row(name).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); flush(); };

beforeEach(() => localStorage.clear());
afterEach(() => { dispose?.(); host?.remove(); });

describe("hotFor", () => {
  const values = () => {
    const v = new Uint8Array(Math.max(...PARAMS.map((p) => p.id)) + 1);
    PARAMS.forEach((p) => { v[p.id] = p.def; });
    return v;
  };
  it("names the path from a station row to Return", () => {
    const h = hotFor(PARAMS.find((p) => p.voice === 0 && p.station === "ordeal")!, values());
    expect(h.from).toBe(4);
    expect(h.caption).toContain("Amp envelope → Drive → Mixer → To the speakers");
    expect(h.fall).toBe(false);
  });
  it("lights the fall and the path from the Hero for fall rows", () => {
    const h = hotFor(def("modamnt1"), values());
    expect(h).toMatchObject({ from: 1, fall: true });
    expect(h.caption).toContain("Oscillator → Click + the fall");
  });
  it("follows a binding from the LFO row to the bound station", () => {
    const v = values();
    const target = PARAMS.find((p) => p.voice === 0 && p.station === "forge")!;
    v[def("target_lfo1").id] = def("target_lfo1").min + targetIndex(target.id);
    const h = hotFor(def("target_lfo1"), v);
    expect(h).toMatchObject({ from: 5, thread: "mentor" });
    expect(h.caption).toContain("Drive → Mixer → To the speakers");
  });
  it("names the path with the voice's own headings: Noise on the snare, Click on the hi-hat", () => {
    const snare = hotFor(PARAMS.find((p) => p.voice === 3 && p.station === "hero")!, values());
    expect(snare.caption).toContain("Oscillator → Click + the fall");
    const call = hotFor(PARAMS.find((p) => p.voice === 3 && p.station === "call")!, values());
    expect(call.caption).toContain("Noise → Oscillator → Click + the fall");
    const hat = hotFor(PARAMS.find((p) => p.voice === 5 && p.station === "hero")!, values());
    expect(hat.caption).toContain("Oscillator → Click → Filter");
  });
  it("lights nothing for an unbound Velocity link", () => {
    const h = hotFor(def("vel_dest_1"), (() => { const v = values(); v[def("vel_dest_1").id] = def("vel_dest_1").min; return v; })());
    expect(h).toMatchObject({ from: null, thread: null });
    expect(h.caption).toContain("nothing");
  });
});

describe("caption and downstream highlighting", () => {
  it("has a polite live caption, empty until a row is pointed at", async () => {
    await mount();
    expect(caption().getAttribute("aria-live")).toBe("polite");
    expect(caption().textContent).toBe("");
  });
  it("lights the bridges downstream of a station row and clears on leave", async () => {
    await mount();
    const r = PARAMS.find((p) => p.voice === 0 && p.station === "ordeal")!;
    point(r.name);
    expect(hotBridges()).toEqual([4, 5, 6]);
    expect(caption().textContent).toContain("Amp envelope → Drive");
    host.querySelector("[data-journey]")!.dispatchEvent(new MouseEvent("mouseleave"));
    flush();
    expect(hotBridges()).toEqual([]);
    expect(caption().textContent).toBe("");
  });
  it("focusing a row works like pointing and names its modulators", async () => {
    await mount();
    const r = PARAMS.find((p) => p.voice === 0 && p.station === "trials")!;
    bind("target_lfo1", r.name);
    row(r.name).dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    flush();
    expect(caption().textContent).toContain("Moved by LFO1");
  });
  it("lights the fall arc for a fall row", async () => {
    await mount();
    point("modamnt1");
    expect(host.querySelector("[data-part=fall][data-hot]")).not.toBeNull();
    expect(hotBridges()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("lights the thread and the path from the bound station for Bindings rows", async () => {
    await mount();
    const r = PARAMS.find((p) => p.voice === 0 && p.station === "forge")!;
    bind("target_lfo1", r.name);
    point("target_lfo1");
    expect(host.querySelector("[data-thread=mentor][data-hot]")).not.toBeNull();
    expect(hotBridges()).toEqual([5, 6]);
    expect(caption().textContent).toContain("LFO moves");
  });
});

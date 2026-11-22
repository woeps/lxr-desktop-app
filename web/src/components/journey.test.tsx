import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { PARAMS } from "../generated/params";
import { stationRows, voicePage } from "../model/stations";
import { createApp, type App as AppState } from "../state/app";
import { AppContext } from "../state/app";
import { SessionContext } from "../state/session";
import { JourneyPage } from "./JourneyPage";

let host: HTMLElement;
let dispose: () => void;
let app: AppState;

function mount(voice: 0 | 1 | 2 | 3 | 4 | 5) {
  const clock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };
  app = createApp({ storage: localStorage, env: { isSecureContext: true } as never, clock, rng: () => 0.5 });
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(
    () => <AppContext value={app}><SessionContext value={app.session}><JourneyPage voice={voice} /></SessionContext></AppContext>,
    host,
  );
  flush();
}
afterEach(() => { dispose(); host.remove(); });
beforeEach(() => localStorage.clear());

const boxes = () => [...host.querySelectorAll<HTMLElement>("[data-station]")];
const text = (el: Element, part: string) => el.querySelector(`[data-part=${part}]`)!.textContent;
const paramsIn = (el: Element) => [...el.querySelectorAll<HTMLElement>("[data-param]")].map((e) => e.dataset.param!);

const TITLES = ["The Call", "The Hero", "The Threshold", "Road of Trials", "The Ordeal", "The Forge", "The Road Back", "Return"];
const SUBS = ["modulator", "oscillator", "click + the fall", "filter", "amp envelope", "drive", "mixer", "to the speakers"];

describe("JourneyPage", () => {
  for (const [voice, count] of [[0, 35], [1, 35], [2, 35], [3, 34], [4, 35], [5, 35]] as const) {
    it(`voice ${voice}: stations in order, every row once (${count})`, () => {
      mount(voice);
      const all = boxes();
      expect(all.map((b) => b.dataset.station)).toEqual(
        ["call", "hero", "threshold", "trials", "ordeal", "forge", "roadBack", "return", "mentor", "bindings", "oracle"]);
      const titles = TITLES.slice();
      const subs = SUBS.slice();
      if (voice === 3) subs[0] = "noise";
      if (voice >= 4) subs[2] = "click";
      all.slice(0, 8).forEach((b, i) => {
        expect(text(b, "title")).toBe(titles[i]);
        expect(text(b, "subtitle")).toBe(subs[i]);
      });
      expect(all.slice(8).map((b) => [text(b, "title"), text(b, "subtitle")])).toEqual([
        ["Mentor", "LFO of the voice"], ["Bindings", "one target each"], ["Oracle", "velocity of the voice"]]);
      const rows = paramsIn(host);
      expect(rows.length).toBe(count);
      expect(new Set(rows).size).toBe(count);
      for (const box of voicePage(voice)) {
        expect(paramsIn(host.querySelector(`[data-station=${box.station}]`)!)).toEqual(box.rows.map((r) => r.name));
      }
    });
  }

  it("Mentor shows the LFO shape controls, Bindings the two target pickers, Oracle the strength", () => {
    mount(0);
    const q = (s: string) => host.querySelector(`[data-station=${s}]`)!;
    expect(paramsIn(q("mentor"))).toEqual(["wave_lfo1", "freq_lfo1", "amount_lfo1", "retrigger_lfo1", "offset_lfo1"]);
    expect(paramsIn(q("bindings"))).toEqual(["target_lfo1", "vel_dest_1"]);
    expect(q("bindings").querySelectorAll("select").length).toBe(2);
    expect([...q("bindings").querySelectorAll("button")].filter((b) => b.textContent === "pick").length).toBe(2);
    expect(paramsIn(q("oracle"))).toEqual(["velo_mod_amt_1"]);
  });

  it("rows write through applyChanges and Return shows the output choice", () => {
    mount(0);
    const def = PARAMS.find((p) => p.name === "audio_out1")!;
    expect(host.querySelector("[data-part=result]")!.textContent).toBe(def.values![0]);
    const sel = host.querySelector<HTMLSelectElement>("[data-param=audio_out1] select")
      ?? host.querySelector<HTMLSelectElement>("[data-param=audio_out1]")!.querySelector("select")!;
    const before = app.session.state.current.values[def.id];
    expect(before).toBe(def.def);
    app.session.applyChanges([[def.id, before!, 2]]);
    flush();
    expect(host.querySelector("[data-part=result]")!.textContent).toBe(def.values![2]);
    expect(sel).toBeTruthy();
    const row = stationRows(0, "forge")[0]!;
    expect(host.querySelector(`[data-param=${row.name}] [role=slider]`)).toBeTruthy();
  });

  it("draws one aria-hidden frame per box (no ResizeObserver in jsdom)", async () => {
    mount(0);
    await Promise.resolve();
    const bs = boxes();
    expect(bs).toHaveLength(11);
    for (const b of bs) {
      const svg = b.querySelector("[data-slot=frame] > svg")!;
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("data-frame")).toBe(b.getAttribute("data-station"));
    }
  });
});

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

const TITLES = ["Modulator", "Oscillator", "Click + the fall", "Filter", "Amp envelope", "Drive", "Mixer", "To the speakers"];

describe("JourneyPage", () => {
  it("every station and card of a voice holds its picture", () => {
    mount(5);
    const pics = [...host.querySelectorAll("[data-slot=picture] svg[data-picture]")].map((e) => e.getAttribute("data-picture"));
    expect(pics).toEqual(["call", "hero", "threshold", "trials", "ordeal", "forge", "roadBack", "return", "mentor", "oracle"]);
  });
  for (const [voice, count] of [[0, 35], [1, 35], [2, 35], [3, 34], [4, 35], [5, 35]] as const) {
    it(`voice ${voice}: stations in order, every row once (${count})`, () => {
      mount(voice);
      const all = boxes();
      expect(all.map((b) => b.dataset.station)).toEqual(
        ["call", "hero", "threshold", "trials", "ordeal", "forge", "roadBack", "return", "mentor", "bindings", "oracle"]);
      const titles = TITLES.slice();
      if (voice === 3) titles[0] = "Noise";
      if (voice >= 4) titles[2] = "Click";
      all.slice(0, 8).forEach((b, i) => {
        expect(text(b, "title")).toBe(titles[i]);
        expect(b.getAttribute("aria-label")).toBe(titles[i]);
        expect(b.querySelector("[data-part=subtitle]")).toBeNull();
      });
      expect(all.slice(8).map((b) => [text(b, "title"), b.getAttribute("aria-label")])).toEqual([
        ["LFO of the voice", "LFO of the voice"], ["Modulation targets", "Modulation targets"],
        ["Velocity of the voice", "Velocity of the voice"]]);
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
    const sel = host.querySelector("[data-param=audio_out1] [role=radiogroup]");
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

describe("output rows", () => {
  it("shows four choices, an alias as its equivalent, and dims pan for left and right", () => {
    mount(0);
    const out = PARAMS.find((p) => p.name === "audio_out1")!;
    const row = () => host.querySelector<HTMLElement>("[data-param=audio_out1]")!;
    const pan = () => host.querySelector<HTMLElement>("[data-param=pan1]")!;
    expect([...row().querySelectorAll("[role=radio]")].map((b) => b.textContent)).toEqual(["main", "left", "right", "FX"]);
    expect(pan().dataset.dimmed).toBeUndefined();
    app.session.applyChanges([[out.id, 0, 4]]);
    flush();
    expect(row().querySelector("[aria-checked=true]")!.textContent).toBe("left");
    expect(row().title).toBe("plays as left");
    expect(app.session.state.current.values[out.id]).toBe(4);
    expect(pan().dataset.dimmed).toBe("true");
    expect(pan().style.opacity).toBe("0.4");
    row().querySelector<HTMLElement>("[data-choice=main]")!.click();
    flush();
    expect(app.session.state.current.values[out.id]).toBe(0);
    expect(pan().dataset.dimmed).toBeUndefined();
  });
});

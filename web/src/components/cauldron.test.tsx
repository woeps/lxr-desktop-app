import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { FX_LABELS, PARAMS } from "../generated/params";
import { createApp, AppContext, type App as AppState } from "../state/app";
import { SessionContext } from "../state/session";
import { CauldronPage } from "./CauldronPage";
import { JourneyPage } from "./JourneyPage";

let host: HTMLElement;
let dispose: () => void;
let app: AppState;

function mount(ui: () => unknown) {
  const clock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };
  app = createApp({ storage: localStorage, env: { isSecureContext: true } as never, clock, rng: () => 0.5 });
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(
    () => <AppContext value={app}><SessionContext value={app.session}>{ui() as never}</SessionContext></AppContext>,
    host,
  );
  flush();
}
afterEach(() => { dispose(); host.remove(); });
beforeEach(() => localStorage.clear());

const def = (name: string, voice: number) => PARAMS.find((p) => p.name === name && p.voice === voice)!;
const set = (name: string, voice: number, to: number) => {
  const d = def(name, voice);
  app.session.applyChanges([[d.id, app.session.state.current.values[d.id]!, to]]);
  flush();
};
const brew = () => host.querySelector("[data-station=brew]")!;
const params = (el: Element) => [...el.querySelectorAll<HTMLElement>("[data-param]")].map((e) => e.dataset.param!);
const label = (name: string) => host.querySelector(`[data-param=${name}] > span:nth-child(3)`)!.textContent;

describe("CauldronPage", () => {
  it("holds three boxes with frame and picture", () => {
    mount(() => <CauldronPage />);
    const boxes = [...host.querySelectorAll("[data-station]")];
    expect(boxes.map((b) => b.getAttribute("data-station"))).toEqual(["brew", "pour", "millstone"]);
    expect(boxes.map((b) => b.querySelector("[data-part=title]")!.textContent)).toEqual(["Effect", "Mix", "All voices"]);
    expect(boxes.map((b) => b.getAttribute("aria-label"))).toEqual(["Effect", "Mix", "All voices"]);
    expect(boxes.some((b) => b.querySelector("[data-part=subtitle]"))).toBe(false);
    expect([...host.querySelectorAll("[data-slot=picture] svg[data-picture]")].map((e) => e.getAttribute("data-picture")))
      .toEqual(["brew", "pour", "millstone"]);
    expect(params(boxes[1]!)).toEqual(["fx_dry_wet", "fx_routing"]);
    expect(params(boxes[2]!)).toEqual(["voice_decimation_all"]);
    expect(host.querySelector("[data-param=fx_reverb_type]")).toBeNull();
  });

  it("shows only what the chosen effect uses, labelled from FX_LABELS", () => {
    mount(() => <CauldronPage />);
    expect(params(brew())).toEqual(["fx_type"]);
    set("fx_type", -1, 1);
    expect(params(brew())).toEqual(["fx_type", "fx_dist_type", "fx_p1", "fx_p2", "fx_p3", "fx_p4"]);
    expect(label("fx_p4")).toBe(FX_LABELS.drv[3]);
    set("fx_type", -1, 2);
    expect(params(brew())).toEqual(["fx_type", "fx_p1", "fx_wave"]);
    expect(label("fx_p1")).toBe(FX_LABELS.rng[0]);
    set("fx_type", -1, 3);
    expect(params(brew())).toEqual(["fx_type", "fx_p1", "fx_p2", "fx_p3", "fx_p4", "fx_ratio"]);
    expect(label("fx_p3")).toBe("threshold");
    set("fx_type", -1, 4);
    expect(params(brew())).toEqual(["fx_type", "fx_p1", "fx_p2", "fx_p3", "fx_p4", "fx_delay_type"]);
    expect(label("fx_p4")).toBe("feedback");
  });
});

describe("Return cauldron", () => {
  const click = (el: Element) => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); flush(); };

  it("opens the Cauldron page when the output is FX", () => {
    mount(() => <JourneyPage voice={0} />);
    const ret = () => host.querySelector("[data-station=return]")!;
    expect(ret().querySelector("[data-part=open-cauldron]")).toBeNull();
    set("audio_out1", 0, 6);
    app.session.setPage(0);
    click(ret().querySelector("[data-slot=picture]")!);
    expect(app.session.state.page).toBe("cauldron");
    app.session.setPage(0);
    click(ret().querySelector("[data-part=open-cauldron]")!);
    expect(app.session.state.page).toBe("cauldron");
  });

  it("does nothing for a speaker output", () => {
    mount(() => <JourneyPage voice={0} />);
    click(host.querySelector("[data-station=return] [data-slot=picture]")!);
    expect(app.session.state.page).toBe(0);
  });

  describe("dragging a slider in The Brew", () => {
    const ptr = (el: Element, type: string, x: number) => {
      const ev = new PointerEvent(type, { clientX: x, button: 0, pointerId: 1, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      flush();
      return ev;
    };
    const bar = () => host.querySelector<HTMLElement>("[data-station=brew] [data-param=fx_p1] [role=slider]")!;
    const value = () => app.session.state.current.values[def("fx_p1", -1).id]!;

    it("follows several moves, stays attached to the same element, and is one history step", () => {
      mount(() => <CauldronPage />);
      set("fx_type", -1, 1);
      const el = bar();
      const captured: number[] = [];
      el.setPointerCapture = (id: number) => { captured.push(id); };
      const before = value();
      const down = ptr(el, "pointerdown", 0);
      expect(down.defaultPrevented).toBe(true); // no text selection starts from this press
      expect(captured).toEqual([1]);
      const seen: number[] = [];
      for (const x of [10, 20, 30, 40]) { ptr(el, "pointermove", x); seen.push(value()); }
      ptr(el, "pointerup", 40);
      expect(seen[0]).toBeGreaterThan(before);
      expect(seen[3]).toBeGreaterThan(seen[0]!); // keeps moving after the first step
      expect(bar()).toBe(el); // the row was not re-created under the pointer
      const after = value();
      expect(app.session.history.undo()).toEqual([[def("fx_p1", -1).id, after, before]]);
      // exactly one step for the drag: the next one back is the effect choice
      expect(app.session.history.undo()![0]![0]).toBe(def("fx_type", -1).id);
    });

    it("cancels mousedown and dragstart so Firefox does not start a selection", () => {
      mount(() => <CauldronPage />);
      set("fx_type", -1, 1);
      for (const type of ["mousedown", "dragstart"]) {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        bar().dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
      }
    });
  });
});

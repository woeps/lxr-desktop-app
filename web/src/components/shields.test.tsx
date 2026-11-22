import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { App } from "../App";
import { createApp, type App as AppState } from "../state/app";
import { SETTINGS_KEY } from "../midi/access";
import { PARAMS } from "../generated/params";
import { voiceOf, PAGES } from "./voices";

let host: HTMLElement;
let dispose: () => void;
let app: AppState;

function mount() {
  const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} };
  const env = { isSecureContext: true, requestMIDIAccess: async () => ({ outputs: { values: () => [] }, onstatechange: null }) };
  app = createApp({ storage: localStorage, env, clock, rng: () => 0.9 });
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <App app={app} />, host);
  flush();
}
beforeEach(() => { localStorage.clear(); mount(); });
afterEach(() => { dispose(); host.remove(); });

const click = (el: Element) => { (el as HTMLElement).click(); flush(); };
const q = (sel: string) => host.querySelector<HTMLElement>(sel)!;
const tab = (n: string) => q(`[role=tab][aria-label="${n}"]`);
const label = (n: string) => q(`[aria-label="${n}"]`);
const press = (el: Element, key: string) => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); flush(); };
const changed = (voice: number) => PARAMS.filter((p) => p.voice === voice && app.session.state.current.values[p.id] !== app.session.state.baseline.values[p.id]).length;
const slider = () => q("input[type=range]") as HTMLInputElement;
const setSlider = (v: number) => { slider().value = String(v); slider().dispatchEvent(new Event("input", { bubbles: true })); flush(); };
const stored = () => JSON.parse(localStorage.getItem(SETTINGS_KEY)!);

describe("shield row", () => {
  it("R4.1/R4.7: dice sit beside tab buttons, only tabs have role tab, FX has none", () => {
    expect(host.querySelectorAll("[role=tab]").length).toBe(7);
    expect(q("[role=tablist]").getAttribute("aria-label")).toBe("Voices");
    for (const p of PAGES) {
      const dice = host.querySelector(`[aria-label="Roll ${p.name}"]`);
      if (p.page === "cauldron") { expect(dice).toBeNull(); continue; }
      expect(dice).toBeTruthy();
      expect(dice!.closest("[role=tab]")).toBeNull();
      expect(dice!.parentElement).toBe(tab(p.name).parentElement);
    }
    // the amount control exists on the selected shield only
    expect(host.querySelectorAll("[aria-label='Roll amount']").length).toBe(1);
    expect(tab("Drum 1").parentElement!.contains(label("Roll amount"))).toBe(true);
    click(tab("Cauldron"));
    expect(host.querySelector("[aria-label='Roll amount']")).toBeNull();
  });

  it("R4.2/R4.6: a dice button selects its voice, rolls it and is one undo step", () => {
    click(label("Roll Snare"));
    expect(tab("Snare").getAttribute("aria-selected")).toBe("true");
    expect(changed(voiceOf(3))).toBeGreaterThan(0);
    expect(changed(0)).toBe(0);
    app.session.undo(); flush();
    expect(changed(voiceOf(3))).toBe(0);
  });

  it("R4.2: a locked parameter stays", () => {
    const id = PARAMS.find((p) => p.voice === 0)!.id;
    app.session.toggleLock(id); flush();
    click(label("Roll Drum 1"));
    expect(app.session.state.current.values[id]).toBe(app.session.state.baseline.values[id]);
  });

  it("R4.3/R4.5: the amount popover sets the shared voice amount and persists it", () => {
    click(label("Roll amount"));
    expect(q("[role=dialog][aria-label='Roll amount']")).toBeTruthy();
    setSlider(0);
    expect(app.settings.state.rollVoice).toBe(0);
    expect(stored().rollVoice).toBe(0);
    // amount 0 changes nothing, for every voice dice (shared amount)
    click(label("Roll Cymbal"));
    expect(changed(4)).toBe(0);
    setSlider(100);
    click(label("Roll amount"));
    expect(app.settings.state.rollAll).toBe(50);
  });

  it("R4.4/R4.5/R4.6: Roll all uses its own amount and is one undo step", () => {
    const rollAllBtn = [...host.querySelectorAll("button")].find((b) => b.textContent!.trim() === "Roll all")!;
    expect(rollAllBtn).toBeTruthy();
    click(q("[aria-label='Roll all amount']"));
    click([...host.querySelectorAll<HTMLElement>("[role=menuitem]")].find((b) => b.textContent!.startsWith("100"))!);
    expect(app.settings.state.rollAll).toBe(100);
    expect(app.settings.state.rollVoice).toBe(50);
    expect(stored().rollAll).toBe(100);
    click(rollAllBtn);
    for (let v = 0; v < 6; v++) expect(changed(v), `voice ${v}`).toBeGreaterThan(0);
    app.session.undo(); flush();
    for (let v = 0; v < 6; v++) expect(changed(v)).toBe(0);
  });

  it("R4.5: both amounts default to 50 and survive a reload", () => {
    expect([app.settings.state.rollVoice, app.settings.state.rollAll]).toEqual([50, 50]);
    app.settings.set({ rollVoice: 20, rollAll: 70 });
    dispose(); host.remove(); mount();
    expect([app.settings.state.rollVoice, app.settings.state.rollAll]).toEqual([20, 70]);
  });

  it("R4.7: arrows, Home and End move between tab buttons", () => {
    press(tab("Drum 1"), "ArrowRight");
    expect(document.activeElement).toBe(tab("Drum 2"));
    press(tab("Drum 2"), "End");
    expect(document.activeElement).toBe(tab("Cauldron"));
    press(tab("Cauldron"), "Home");
    expect(document.activeElement).toBe(tab("Drum 1"));
    press(label("Roll Drum 1"), "ArrowRight");
    expect(tab("Drum 1").getAttribute("aria-selected")).toBe("true");
  });

  it("R4.8: the toolbar has no roll controls", () => {
    expect(q("[role=toolbar]").textContent).not.toMatch(/Roll/);
    expect(q("[role=toolbar]").querySelector("[aria-label^=Roll]")).toBeNull();
  });
});

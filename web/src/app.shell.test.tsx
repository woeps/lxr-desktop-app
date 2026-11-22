import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { readFileSync } from "node:fs";
import { PARAMS } from "./generated/params";
import { App } from "./App";
import { createApp, type App as AppState } from "./state/app";
import { NOTICE_NO_FLASH, NOTICE_NOT_SEEN, NOTICE_ONE_WAY } from "./components/notices";

let host: HTMLElement;
let dispose: () => void;
let app: AppState;
let out: number[][];
let timers: (() => void)[];
let now = 0;

function mount(withOutput = true) {
  out = [];
  timers = [];
  now = 0;
  const clock = { now: () => now, setTimeout: (f: () => void) => { timers.push(f); return timers.length; }, clearTimeout: () => {} };
  const port = { id: "p1", name: "Fake out", send: (d: number[]) => { out.push(d); } };
  const env = {
    isSecureContext: true,
    requestMIDIAccess: async () => ({ outputs: { values: () => (withOutput ? [port] : []) }, onstatechange: null }),
  };
  app = createApp({ storage: localStorage, env, clock, rng: () => 0.9 });
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <App app={app} />, host);
  flush();
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); flush(); };
const btn = (name: string) => host.querySelector<HTMLElement>(`[aria-label="${name}"]`)
  ?? [...host.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent!.trim().startsWith(name))!;
const click = (el: Element) => { (el as HTMLElement).click(); flush(); };
const connect = async () => { click(btn("Connect")); await tick(); out.length = 0; };
const rows = () => [...host.querySelectorAll<HTMLElement>("[data-param]")].map((e) => e.dataset.param!);
const press = (el: Element, key: string, init: KeyboardEventInit = {}) => {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  flush();
};

beforeEach(() => localStorage.clear());
afterEach(() => { dispose(); host.remove(); });

describe("page shell", () => {
  beforeEach(() => mount());

  it("renders every control with an accessible name", () => {
    for (const n of ["Connect", "MIDI output", "Test", "Undo", "Redo", "A/B", "Revert", "Initialise", "Send all",
      "Seal into boot slot", "Save to library", "Roll amount", "Roll", "Velocity", "Pitch", "Play all", "Panic"]) {
      expect(btn(n), n).toBeTruthy();
    }
    for (const n of ["Drum 1", "Drum 2", "Drum 3", "Snare", "Cymbal", "Hi-hat", "Cauldron"]) {
      expect(host.querySelector(`[role=tab][aria-label="${n}"]`), n).toBeTruthy();
    }
    for (const n of ["Drum 1", "Drum 2", "Drum 3", "Snare", "Cymbal", "Closed hi-hat", "Open hi-hat"]) {
      expect(btn(`Trigger ${n}`), n).toBeTruthy();
    }
  });

  it("shows the fixed notices, taken verbatim from requirements.md", () => {
    const req = readFileSync("../.kiro/specs/build-an-interactive-web-ui-for/requirements.md", "utf8").replace(/\s+/g, " ");
    const text = host.textContent!;
    for (const [notice, phrase] of [
      [NOTICE_ONE_WAY, "it cannot detect the module, its firmware version, or whether a message arrived"],
      [NOTICE_NOT_SEEN, "Values changed on the module by other means (MIDI from a keyboard or DAW, the module's console) are not seen"],
      [NOTICE_NO_FLASH, "A transfer does not write flash: the sent sound is live until the next transfer or until the module loses power, after which the module plays its boot slot, unless"],
    ] as const) {
      expect(text).toContain(notice);
      expect(notice).toContain(phrase.replace(/^Values/, "Values"));
      expect(req.toLowerCase()).toContain(phrase.toLowerCase());
    }
    expect(text).toContain("Send all makes the module match the page");
    expect(text).toContain("Not sending");
  });

  it("switching a shield shows only that voice's controls", () => {
    const seen = new Map<string, string[]>();
    for (const [i, n] of ["Drum 1", "Drum 2", "Drum 3", "Snare", "Cymbal", "Hi-hat", "Cauldron"].entries()) {
      click(host.querySelector(`[role=tab][aria-label="${n}"]`)!);
      const shown = rows();
      const voice = i === 6 ? -1 : i;
      // The Cauldron shows only what the chosen effect uses (default "off": design 4.12.3).
      const expected = PARAMS.filter((p) => p.voice === voice && !p.inert && (voice !== -1 || !/^fx_(dist_type|p\d|ratio|wave|delay_type)$/.test(p.name)))
        .map((p) => p.name).sort();
      expect(shown.slice().sort()).toEqual(expected);
      expect(host.querySelector(`[role=tab][aria-label="${n}"]`)!.getAttribute("aria-selected")).toBe("true");
      seen.set(n, shown);
    }
    expect(seen.get("Drum 1")).not.toEqual(seen.get("Snare"));
    expect(seen.get("Cymbal")).not.toEqual(seen.get("Cauldron"));
  });

  it("operates the shields with the keyboard", () => {
    const tab = (n: string) => host.querySelector<HTMLElement>(`[role=tab][aria-label="${n}"]`)!;
    press(tab("Drum 1"), "ArrowRight");
    expect(app.session.state.page).toBe(1);
    expect(document.activeElement).toBe(tab("Drum 2"));
    press(tab("Drum 2"), "End");
    expect(app.session.state.page).toBe("cauldron");
    press(tab("Cauldron"), "ArrowRight");
    expect(app.session.state.page).toBe(0);
    press(tab("Drum 1"), "ArrowLeft");
    expect(app.session.state.page).toBe("cauldron");
    press(tab("Cauldron"), "Home");
    expect(app.session.state.page).toBe(0);
    expect(tab("Drum 1").tabIndex).toBe(0);
    expect(tab("Drum 2").tabIndex).toBe(-1);
  });

  it("Undo and Redo follow the history", () => {
    const undo = btn("Undo") as HTMLButtonElement;
    const redo = btn("Redo") as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);
    const p = PARAMS.find((x) => x.voice === 0 && x.kind === "num")!;
    app.session.applyChanges([[p.id, p.def, p.def === 0 ? 1 : 0]]);
    flush();
    expect(undo.disabled).toBe(false);
    click(undo);
    expect(app.session.state.current.values[p.id]).toBe(p.def);
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(false);
    click(redo);
    expect(redo.disabled).toBe(true);
  });

  it("Copy and Paste exist on drum pages 1 to 3 only", () => {
    const has = () => !!btn("Copy") && [...host.querySelectorAll("button")].some((b) => b.textContent === "Paste");
    for (const [n, expected] of [["Drum 1", true], ["Drum 2", true], ["Drum 3", true], ["Snare", false], ["Cymbal", false], ["Hi-hat", false], ["Cauldron", false]] as const) {
      click(host.querySelector(`[role=tab][aria-label="${n}"]`)!);
      expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Copy"), n).toBe(expected);
      if (expected) expect(has()).toBe(true);
    }
  });

  it("Roll uses the amount", () => {
    const slider = btn("Roll amount") as HTMLInputElement;
    const before = Uint8Array.from(app.session.state.current.values);
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    click(btn("Roll"));
    expect(app.session.state.current.values).toEqual(before); // amount 0 changes nothing
    slider.value = "100";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    click(btn("Roll"));
    const changed = PARAMS.filter((p) => app.session.state.current.values[p.id] !== before[p.id]);
    expect(changed.length).toBeGreaterThan(5);
    expect(changed.every((p) => p.voice === 0)).toBe(true);
  });

  it("Copy then Paste moves a drum voice onto another", () => {
    const p1 = PARAMS.find((p) => p.voice === 0 && p.slotKey && p.kind === "num" && !p.mix)!;
    const p2 = PARAMS.find((p) => p.voice === 1 && p.slotKey === p1.slotKey)!;
    app.session.applyChanges([[p1.id, p1.def, p1.def === 5 ? 6 : 5]]);
    click(btn("Copy"));
    click(host.querySelector("[role=tab][aria-label='Drum 2']")!);
    click([...host.querySelectorAll("button")].find((b) => b.textContent === "Paste")!);
    expect(app.session.state.current.values[p2.id]).toBe(app.session.state.current.values[p1.id]);
  });
});

describe("with a MIDI output", () => {
  beforeEach(async () => { mount(); await connect(); });

  it("a rune stone sends note on, then note off after the delay", () => {
    click(btn("Trigger Snare"));
    expect(out).toEqual([[0x93, 60 === app.settings.state.notes[3] ? 60 : app.settings.state.notes[3] || 60, 100]]);
    timers.forEach((f) => f());
    flush();
    expect(out[1]![0]).toBe(0x83);
    expect(out[1]![2]).toBe(0);
  });

  it("Panic sends note off for held notes", () => {
    click(btn("Trigger Drum 2"));
    out.length = 0;
    click(btn("Panic"));
    expect(out.length).toBe(1);
    expect(out[0]![0]).toBe(0x81);
    expect(out[0]![2]).toBe(0);
    timers.forEach((f) => f()); // the pending note off finds nothing held
    expect(out.length).toBe(1);
  });

  it("Send all sends every parameter, and a mapped key strikes without repeating", () => {
    click(btn("Send all"));
    for (let i = 0; i < 400; i++) { now += 30; const due = timers.splice(0); due.forEach((f) => f()); }
    flush();
    expect(out.length).toBe(PARAMS.length); // one output.send per parameter (an NRPN is one 9-byte send)
    out.length = 0;
    press(document.body, "1");
    expect(out.length).toBe(1);
    expect(out[0]![0]).toBe(0x90);
  });

  it("Play all strikes the seven voices", () => {
    click(btn("Play all"));
    expect(out.map((m) => m[0] & 0x0f)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("the velocity control sets the note velocity", () => {
    const v = btn("Velocity") as HTMLInputElement;
    v.value = "42";
    v.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    click(btn("Trigger Drum 1"));
    expect(out[0]![2]).toBe(42);
  });
});

describe("preset importer drawer", () => {
  beforeEach(() => mount());
  const toggle = () => click([...host.querySelectorAll("button")].find((b) => b.textContent === "Preset importer")!);
  const drawer = () => host.querySelector("aside[aria-label='Preset importer']");

  it("opens and closes from the toolbar and keeps its list while closed", async () => {
    expect(drawer()).toBeNull();
    toggle();
    expect(drawer()).toBeTruthy();
    const f = (n: string) => new File([new Uint8Array(255)], n);
    const files = host.querySelector<HTMLInputElement>("[aria-label='Open files']")!;
    Object.defineProperty(files, "files", { value: [f("A.SND"), f("B.SND")], configurable: true });
    files.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 2)); flush(); }
    const rowsOf = () => [...host.querySelectorAll<HTMLElement>("button[data-select]")];
    expect(rowsOf().length).toBe(2);
    click(rowsOf()[1]!);
    await tick();
    expect(rowsOf()[1]!.getAttribute("aria-pressed")).toBe("true");
    toggle();
    expect(drawer()).toBeNull();
    toggle();
    expect(rowsOf().length).toBe(2);
    expect(rowsOf()[1]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("closes with Escape", () => {
    toggle();
    press(drawer()!, "Escape");
    expect(drawer()).toBeNull();
  });
});

describe("without an output", () => {
  it("disables sending and says nothing is sent", () => {
    mount(false);
    expect((btn("Trigger Drum 1") as HTMLButtonElement).disabled).toBe(true);
    expect((btn("Send all") as HTMLButtonElement).disabled).toBe(true);
    expect(host.textContent).toContain("Not sending");
  });
});

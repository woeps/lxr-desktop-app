import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { Popover } from "./Popover";
import { SplitButton } from "./SplitButton";
import { readFileSync } from "node:fs";
import { App } from "../App";
import { PARAMS } from "../generated/params";
import { factory } from "../model/sound";
import { createApp, type App as AppState } from "../state/app";
import { NOTICE_NOT_SEEN, NOTICE_ONE_WAY } from "./notices";

let host: HTMLElement;
let dispose: () => void;
let pressed = 0;
let picked: string[] = [];

function mount(ui: () => unknown) {
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(ui as never, host);
  flush();
}
afterEach(() => { dispose?.(); host?.remove(); pressed = 0; picked = []; });

const key = (el: Element, k: string) => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); flush(); };
const click = (el: Element) => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); flush(); };
const caret = () => host.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")!;
const menu = () => host.querySelector<HTMLElement>("[role=menu]");
const items = () => Array.from(host.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));

function mountSplit() {
  mount(() => (
    <>
      <SplitButton
        label="Send"
        onPress={() => { pressed++; }}
        menu={<>
          {["One", "Two", "Three"].map((n) => <button type="button" role="menuitem" onClick={() => picked.push(n)}>{n}</button>)}
        </>}
      />
      <button id="outside" type="button">outside</button>
    </>
  ));
}

describe("SplitButton", () => {
  it("main button presses, caret has haspopup and expanded", () => {
    mountSplit();
    expect(caret().getAttribute("aria-haspopup")).toBe("menu");
    expect(caret().getAttribute("aria-expanded")).toBe("false");
    click(host.querySelector("button")!);
    expect(pressed).toBe(1);
    expect(menu()).toBeNull();
  });

  it("opens by click, focuses the first item and toggles closed", () => {
    mountSplit();
    click(caret());
    expect(menu()).not.toBeNull();
    expect(caret().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items()[0]);
    click(caret());
    expect(menu()).toBeNull();
    expect(caret().getAttribute("aria-expanded")).toBe("false");
  });

  it.each(["Enter", " ", "ArrowDown"])("opens by key %j", (k) => {
    mountSplit();
    caret().focus();
    key(caret(), k);
    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(items()[0]);
  });

  it("moves with ArrowUp, ArrowDown, Home and End and keeps one tab stop", () => {
    mountSplit();
    click(caret());
    const [a, b, c] = items();
    key(a!, "ArrowDown");
    expect(document.activeElement).toBe(b);
    key(b!, "ArrowDown");
    expect(document.activeElement).toBe(c);
    key(c!, "ArrowDown");
    expect(document.activeElement).toBe(a);
    key(a!, "ArrowUp");
    expect(document.activeElement).toBe(c);
    key(c!, "Home");
    expect(document.activeElement).toBe(a);
    key(a!, "End");
    expect(document.activeElement).toBe(c);
    expect(items().map((i) => i.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("Escape closes and returns focus to the caret", () => {
    mountSplit();
    click(caret());
    key(items()[1]!, "Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(caret());
  });

  it("choosing an item runs it, closes and returns focus", () => {
    mountSplit();
    click(caret());
    click(items()[1]!);
    expect(picked).toEqual(["Two"]);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(caret());
  });

  it("closes on pointerdown outside but not inside", () => {
    mountSplit();
    click(caret());
    items()[0]!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    flush();
    expect(menu()).not.toBeNull();
    host.querySelector("#outside")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    flush();
    expect(menu()).toBeNull();
  });

  it("closes when focus leaves to another element", () => {
    mountSplit();
    click(caret());
    const out = host.querySelector<HTMLElement>("#outside")!;
    items()[0]!.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: out }));
    flush();
    expect(menu()).toBeNull();
  });
});

describe("Popover", () => {
  it("a dialog popover renders in place with its role and label, closes on Escape", () => {
    const [open, setOpen] = createSignal(true);
    mount(() => (
      <span>
        <button id="a" type="button">anchor</button>
        <Popover open={open()} onClose={() => setOpen(false)} anchor={() => host.querySelector<HTMLElement>("#a")!} role="dialog" label="Amount" placement="top">
          <input aria-label="Amount value" />
        </Popover>
      </span>
    ));
    const d = host.querySelector<HTMLElement>("[role=dialog]")!;
    expect(d.getAttribute("aria-label")).toBe("Amount");
    expect(d.dataset.placement).toBe("top");
    expect(host.contains(d)).toBe(true);
    key(d.querySelector("input")!, "Escape");
    expect(host.querySelector("[role=dialog]")).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("#a"));
  });
});

describe("AppBar", () => {
  let app: AppState;
  function mountApp() {
    localStorage.clear();
    const clock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };
    app = createApp({ storage: localStorage, env: { isSecureContext: true, requestMIDIAccess: undefined }, clock, rng: () => 0.5,
      motionEnv: { now: () => 0, raf: () => 1, caf: () => {}, matchMedia: () => ({ matches: false }) } });
    mount(() => <App app={app} />);
  }
  const bar = () => host.querySelector<HTMLElement>("[role=toolbar]")!;
  const byLabel = (l: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${l}"]`)!;
  const text = (t: string) => [...bar().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent!.trim() === t)!;
  const two = () => PARAMS.filter((p) => p.kind === "num" && p.max - p.min >= 4).slice(0, 2);
  const bump = () => two().forEach((p) => {
    const v = app.session.state.current.values[p.id]!;
    app.session.applyChanges([[p.id, v, v + 1]]);
  });

  it("holds the items in the order of R1.1", () => {
    mountApp();
    const order = [...bar().querySelectorAll<HTMLElement>("button, input")].map((e) => e.getAttribute("aria-label") ?? e.textContent!.trim());
    expect(order).toEqual(["Sound name", "Save", "Save options", "Undo", "Redo", "A/B", "Revert", "Revert options",
      "Copy", "Paste", "Send all", "Send options", "Library", "Import presets", "Settings", "Info"]);
  });

  it("does not hold the items of R1.2", () => {
    mountApp();
    const t = bar().textContent!;
    expect(t).not.toContain(NOTICE_ONE_WAY);
    expect(t).not.toContain(NOTICE_NOT_SEEN);
    expect(t).not.toContain("Not sending");
    expect(bar().querySelector("progress, input[type=checkbox], input[type=range]")).toBeNull();
    for (const b of bar().querySelectorAll("button")) {
      expect(b.textContent!.trim()).not.toMatch(/^(Connect|Test|Roll|Close|Cancel|Audition)/);
    }
    expect(t).not.toContain("Audition after send"); // only inside the open Send menu
  });

  it("icon buttons have an accessible name and a tooltip; the old labels are gone", () => {
    mountApp();
    for (const n of ["Library", "Import presets", "Settings", "Info"]) {
      expect(byLabel(n).title).toBe(n);
    }
    expect(host.querySelector("[aria-label='Grimoire'], [aria-label='Preset importer']")).toBeNull();
    expect([...bar().querySelectorAll("button")].some((b) => /Grimoire|Preset importer/.test(b.textContent!))).toBe(false);
  });

  it("the panel icons toggle the shell state and open the existing panels", () => {
    mountApp();
    click(byLabel("Library"));
    expect(byLabel("Library").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector("aside[aria-label='Library']")).not.toBeNull();
    click(byLabel("Import presets"));
    expect(host.querySelector("aside[aria-label='Library']")).toBeNull();
    expect(host.querySelector("aside[aria-label='Import presets']")).not.toBeNull();
    click(byLabel("Import presets"));
    expect(host.querySelector("aside")).toBeNull();
  });

  it("Revert restores the loaded sound; its menu Initialise is one undo step without confirmation", () => {
    mountApp();
    bump();
    click(text("Revert"));
    const [p, q] = two();
    expect(app.session.state.current.values[p!.id]).toBe(app.session.state.baseline.values[p!.id]);
    bump();
    const edited = Uint8Array.from(app.session.state.current.values);
    click(byLabel("Revert options"));
    const item = host.querySelector<HTMLElement>("[role=menuitem]")!;
    expect(item.textContent).toBe("Initialise");
    app.session.applyChanges([[q!.id, edited[q!.id]!, edited[q!.id]! + 1]]);
    const edited2 = Uint8Array.from(app.session.state.current.values);
    click(item);
    expect(host.querySelector("[role=alertdialog], [role=dialog]")).toBeNull();
    const init = app.session.state.current.values;
    expect(init[p!.id]).toBe(p!.def);
    expect(init[q!.id]).toBe(q!.def);
    click(text("Undo"));
    expect(app.session.state.current.values).toEqual(edited2); // one step brought everything back
  });

  it("the Send menu has Seal, which opens the store dialog, and Audition after send", () => {
    mountApp();
    app.hasOutput = () => true; // Seal needs an output (R6.4)
    click(byLabel("Send options"));
    const items = [...host.querySelectorAll<HTMLElement>("[role=menuitem]")].map((i) => i.textContent!.trim());
    expect(items).toEqual(["Seal into boot slot", "Audition after send"]);
    click(host.querySelectorAll<HTMLElement>("[role=menuitem]")[0]!);
    expect(host.querySelector("[role=dialog][aria-label='Seal into boot slot']")).not.toBeNull();
    click(byLabel("Send options"));
    const before = app.settings.state.auditionAfterSend;
    click(host.querySelectorAll<HTMLElement>("[role=menuitem]")[1]!);
    expect(app.settings.state.auditionAfterSend).toBe(!before);
  });

  it("wraps to two lines below 1100 px without hiding anything (flex-wrap)", () => {
    expect(readFileSync("src/components/AppBar.module.css", "utf8")).toMatch(/\.bar\s*\{[^}]*flex-wrap:\s*wrap/);
  });
});

describe("side panels", () => {
  let app: AppState;
  beforeEach(() => {
    localStorage.clear();
    app = createApp({ storage: localStorage, env: { isSecureContext: true, requestMIDIAccess: undefined },
      clock: { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} }, rng: () => 0.5 });
    mount(() => <App app={app} />);
  });
  const icon = (l: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${l}"]`)!;
  const panels = () => [...host.querySelectorAll("aside[role=complementary]")].map((a) => a.getAttribute("aria-label"));
  const esc = (el: Element) => { el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); flush(); };

  it("is a complementary region named like its icon, with focus moved in and back", () => {
    icon("Import presets").focus();
    click(icon("Import presets"));
    expect(panels()).toEqual(["Import presets"]);
    expect(document.activeElement).toBe(host.querySelector("aside button[aria-label='Close Import presets']"));
    esc(document.activeElement!);
    expect(panels()).toEqual([]);
    expect(document.activeElement).toBe(icon("Import presets"));
  });

  it("holds one panel at a time and has an X but no bottom Close", () => {
    click(icon("Library"));
    click(icon("Import presets"));
    expect(panels()).toEqual(["Import presets"]);
    expect(document.activeElement).toBe(host.querySelector("aside button[aria-label='Close Import presets']"));
    expect([...host.querySelectorAll("aside button")].some((b) => b.textContent!.trim() === "Close")).toBe(false);
    click(host.querySelector("aside button[aria-label='Close Import presets']")!);
    expect(panels()).toEqual([]);
  });

  it("closes on a press outside, not on a press inside", () => {
    click(icon("Import presets"));
    host.querySelector("aside")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    flush();
    expect(panels()).toEqual(["Import presets"]);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    flush();
    expect(panels()).toEqual([]);
  });

  it("Escape closes a nested dialog first, then the panel", () => {
    app.library.add("Alpha", factory("Alpha"));
    app.session.applyChanges([[PARAMS[0]!.id, 0, 1]]);
    click(icon("Library"));
    click([...host.querySelectorAll<HTMLButtonElement>("aside button")].find((b) => b.textContent === "Load Alpha")!);
    const dlg = host.querySelector("[role=alertdialog]")!;
    esc(dlg);
    expect(host.querySelector("[role=alertdialog]")).toBeNull();
    expect(panels()).toEqual(["Library"]);
    esc(host.querySelector("aside")!);
    expect(panels()).toEqual([]);
  });
});

describe("dock and connection pill", () => {
  let app: AppState;
  let sent: number[][];
  function mountDock(withOutput: boolean) {
    localStorage.clear();
    sent = [];
    const port = { id: "p1", name: "Fake out", send: (d: number[]) => { sent.push(d); } };
    app = createApp({ storage: localStorage, rng: () => 0.5, clock: { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} },
      env: { isSecureContext: true, requestMIDIAccess: async () => ({ outputs: { values: () => (withOutput ? [port] : []) }, onstatechange: null }) } });
    mount(() => <App app={app} />);
  }
  const pill = () => host.querySelector<HTMLButtonElement>("[data-connection-pill]")!;
  const pop = () => host.querySelector("[role=dialog][aria-label='MIDI connection']");
  const named = (l: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${l}"]`)!;
  const text = (t: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent!.trim().startsWith(t))!;

  it("shows the state as text, does not open on load and toggles by click", () => {
    mountDock(false);
    expect(pill().textContent!.trim()).toBe("Not connected");
    expect(pop()).toBeNull();
    click(pill());
    expect(pop()).not.toBeNull();
    expect(pop()!.textContent).toContain(NOTICE_ONE_WAY);
    expect(pop()!.querySelector("[aria-label='MIDI output']")).not.toBeNull();
    click(pill());
    expect(pop()).toBeNull();
  });

  it("opens on a guarded action without an output and runs nothing", () => {
    for (const run of [() => click(named("Trigger Snare")), () => click(text("Play all")), () => click(text("Send all")),
      () => { click(named("Send options")); click(host.querySelector("[role=menuitem]")!); },
      () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }))]) {
      mountDock(false);
      expect(pop()).toBeNull();
      run(); flush();
      expect(pop()).not.toBeNull();
      expect(sent).toHaveLength(0);
      expect(host.querySelector("[role=dialog][aria-label='Seal into boot slot']")).toBeNull();
      dispose(); host.remove();
    }
  });

  it("collapse keeps the pill and the keys, and persists", async () => {
    mountDock(true);
    click(pill());
    click(text("Connect"));
    await Promise.resolve(); await Promise.resolve(); flush();
    sent.length = 0;
    click(named("Collapse dock"));
    expect(app.settings.state.dockCollapsed).toBe(true);
    expect(JSON.parse(localStorage.getItem("lxr.settings.v1")!).dockCollapsed).toBe(true);
    expect(pill().textContent!.trim()).toBe("Fake out");
    expect(pill().getAttribute("aria-label")).toBe("Fake out");
    expect(pill().title).toBe("Fake out");
    expect(host.querySelector("[aria-label='Trigger Snare']")).toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true })); flush();
    expect(sent.length).toBeGreaterThan(0);
    click(named("Expand dock"));
    expect(host.querySelector("[aria-label='Trigger Snare']")).not.toBeNull();
  });
});

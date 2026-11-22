import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { PARAMS, type ParamDef } from "../generated/params";
import { createSession, SessionContext, type Session } from "../state/session";
import { Chips } from "./Chips";
import { LiquidBar } from "./LiquidBar";
import { ParamRow } from "./ParamRow";
import { TargetSelect, targetGroups } from "./TargetSelect";

const byName = (n: string) => PARAMS.find((p) => p.name === n)!;
const NUM = PARAMS.find((p) => p.kind === "num" && p.min === 0 && p.max === 127 && p.def !== 0 && p.def !== 127 && p.def > 20 && p.def < 100)!;
const CHIPS = PARAMS.find((p) => p.kind === "enum" && (p.values?.length ?? 0) > 1 && (p.values?.length ?? 0) <= 4)!;
const LFO_TARGET = byName("target_lfo1");

let host: HTMLElement;
let dispose: () => void;
let session: Session;
let sent: [number, number][];

function mount(ui: () => unknown) {
  sent = [];
  const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} };
  session = createSession({
    storage: localStorage, clock: clock as never, hasOutput: () => true,
    sender: { setParam: (id, v) => sent.push([id, v]), sendTransfer: () => {} },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <SessionContext value={session}>{ui() as never}</SessionContext>, host);
  flush();
}
beforeEach(() => localStorage.clear());
afterEach(() => { dispose(); host.remove(); });

const val = (d: ParamDef) => session.state.current.values[d.id]!;
const press = (el: Element, key: string, init: KeyboardEventInit = {}) => {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  flush();
};
const ptr = (el: Element, type: string, x: number, init: PointerEventInit = {}) => {
  el.dispatchEvent(new PointerEvent(type, { clientX: x, button: 0, pointerId: 1, bubbles: true, cancelable: true, ...init }));
  flush();
};
const slider = () => host.querySelector<HTMLElement>("[role=slider]")!;
const steps = () => { let n = 0; while (session.history.canUndo()) { session.history.undo(); n++; } return n; };

describe("LiquidBar", () => {
  beforeEach(() => mount(() => <LiquidBar def={NUM} />));

  it("is a slider with name, range and current value", () => {
    const s = slider();
    expect(s.getAttribute("aria-label")).toBe(NUM.label);
    expect(s.getAttribute("aria-valuemin")).toBe(String(NUM.min));
    expect(s.getAttribute("aria-valuemax")).toBe(String(NUM.max));
    expect(s.getAttribute("aria-valuenow")).toBe(String(NUM.def));
  });

  it("steps with arrows, Shift+arrows, PageUp/PageDown, Home, End and Backspace", () => {
    const s = slider();
    press(s, "ArrowRight"); expect(val(NUM)).toBe(NUM.def + 1);
    press(s, "ArrowUp"); expect(val(NUM)).toBe(NUM.def + 2);
    press(s, "ArrowLeft"); expect(val(NUM)).toBe(NUM.def + 1);
    press(s, "ArrowDown"); expect(val(NUM)).toBe(NUM.def);
    press(s, "ArrowRight", { shiftKey: true }); expect(val(NUM)).toBe(NUM.def + 10);
    press(s, "PageDown"); expect(val(NUM)).toBe(NUM.def);
    press(s, "PageUp"); expect(val(NUM)).toBe(NUM.def + 10);
    press(s, "Home"); expect(val(NUM)).toBe(NUM.min);
    expect(s.getAttribute("aria-valuenow")).toBe(String(NUM.min));
    press(s, "End"); expect(val(NUM)).toBe(NUM.max);
    press(s, "ArrowRight"); expect(val(NUM)).toBe(NUM.max);
    press(s, "Backspace"); expect(val(NUM)).toBe(NUM.def);
  });

  it("drags relative to the grab point: value moves by the delta, it does not jump to the pointer", () => {
    const s = slider();
    ptr(s, "pointerdown", 500);
    expect(val(NUM)).toBe(NUM.def); // pressing alone changes nothing
    ptr(s, "pointermove", 520); // 20 px of a 200 px fallback track = 10% of 127
    expect(val(NUM)).toBe(NUM.def + Math.round(0.1 * 127));
    ptr(s, "pointerup", 520);
  });

  it("one whole drag is exactly one history step, undone in one go", () => {
    const s = slider();
    ptr(s, "pointerdown", 0);
    for (const x of [10, 20, 30, 40]) ptr(s, "pointermove", x);
    ptr(s, "pointerup", 40);
    expect(val(NUM)).not.toBe(NUM.def);
    expect(sent.length).toBeGreaterThan(1); // every move was sent
    const after = val(NUM);
    const undo = session.history.undo()!;
    expect(undo).toEqual([[NUM.id, after, NUM.def]]);
    expect(session.history.canUndo()).toBe(false);
  });

  it("a drag that ends where it began adds no history step", () => {
    const s = slider();
    ptr(s, "pointerdown", 100); ptr(s, "pointermove", 140); ptr(s, "pointermove", 100); ptr(s, "pointerup", 100);
    expect(val(NUM)).toBe(NUM.def);
    expect(steps()).toBe(0);
  });

  it("Shift drag is fine: a quarter of the normal travel", () => {
    const s = slider();
    ptr(s, "pointerdown", 0); ptr(s, "pointermove", 100); ptr(s, "pointerup", 100);
    const normal = val(NUM) - NUM.def;
    ptr(s, "pointerdown", 0, {}); // fresh drag from the new value
    const before = val(NUM);
    ptr(s, "pointermove", 100, { shiftKey: true }); ptr(s, "pointerup", 100);
    const fine = val(NUM) - before;
    expect(normal).toBe(Math.round(0.5 * 127));
    expect(fine).toBe(Math.round(0.5 * 127 * 0.25));
    expect(fine).toBeLessThan(normal);
  });

  it("double-click resets to the default as one undo step", () => {
    const s = slider();
    press(s, "End");
    s.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); flush();
    expect(val(NUM)).toBe(NUM.def);
    expect(session.history.undo()).toEqual([[NUM.id, NUM.def, NUM.max]]);
  });

  it("a locked row ignores keyboard, drag, double-click and reset", () => {
    press(slider(), "ArrowRight");
    session.toggleLock(NUM.id); flush();
    const v = val(NUM);
    const s = slider();
    expect(s.getAttribute("aria-readonly")).toBe("true");
    press(s, "ArrowRight"); press(s, "End"); press(s, "Backspace");
    ptr(s, "pointerdown", 0); ptr(s, "pointermove", 100); ptr(s, "pointerup", 100);
    s.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); flush();
    expect(val(NUM)).toBe(v);
  });
});

describe("Chips", () => {
  beforeEach(() => mount(() => <Chips def={CHIPS} />));
  const radios = () => [...host.querySelectorAll<HTMLElement>("[role=radio]")];
  const checked = () => radios().findIndex((r) => r.getAttribute("aria-checked") === "true");

  it("is a labelled radio group with one chip per value", () => {
    expect(host.querySelector("[role=radiogroup]")!.getAttribute("aria-label")).toBe(CHIPS.label);
    expect(radios().map((r) => r.textContent)).toEqual([...CHIPS.values!]);
    expect(checked()).toBe(CHIPS.def - CHIPS.min);
  });

  it("selects by click and by arrow keys, one step each", () => {
    const last = radios().length - 1;
    radios()[last]!.click(); flush();
    expect(val(CHIPS)).toBe(CHIPS.min + last);
    expect(checked()).toBe(last);
    press(radios()[last]!, "ArrowLeft");
    expect(val(CHIPS)).toBe(CHIPS.min + last - 1);
    press(radios()[0]!, "Home");
    expect(val(CHIPS)).toBe(CHIPS.min);
    press(radios()[0]!, "End");
    expect(val(CHIPS)).toBe(CHIPS.min + last);
    expect(steps()).toBeGreaterThanOrEqual(3);
  });

  it("ignores a locked row", () => {
    session.toggleLock(CHIPS.id); flush();
    const v = val(CHIPS);
    radios()[radios().length - 1]!.click(); press(radios()[0]!, "End"); flush();
    expect(val(CHIPS)).toBe(v);
  });
});

describe("TargetSelect", () => {
  beforeEach(() => mount(() => <TargetSelect def={LFO_TARGET} />));

  it("groups the 229 targets and keeps each once", () => {
    const groups = targetGroups(LFO_TARGET);
    expect(groups.flatMap((g) => g.items).length).toBe(LFO_TARGET.values!.length);
    expect(groups.length).toBeGreaterThan(5);
    expect(host.querySelectorAll("option").length).toBe(LFO_TARGET.values!.length);
  });

  it("labels every group with the voice and the station heading, never a raw station id", () => {
    const old = /\b(call|hero|threshold|trials|ordeal|forge|roadBack|mentor|oracle|brew|pour|millstone|journey)\b/i;
    for (const def of [LFO_TARGET, ...PARAMS.filter((d) => d.name.startsWith("vel_dest"))]) {
      for (const g of targetGroups(def)) expect(g.label).not.toMatch(old);
    }
    const labels = targetGroups(LFO_TARGET).map((g) => g.label);
    expect(labels).toContain("Drum 1 · Drive");
    expect(labels).toContain("Snare · Noise");
  });

  it("selects a target through the menu and the value reaches the session", () => {
    const sel = host.querySelector("select")!;
    expect(sel.getAttribute("aria-label")).toBe(LFO_TARGET.label);
    sel.value = "5";
    sel.dispatchEvent(new Event("change", { bubbles: true })); flush();
    expect(val(LFO_TARGET)).toBe(LFO_TARGET.min + 5);
  });

  it("toggles pick mode with the pick button", () => {
    const btn = host.querySelector<HTMLButtonElement>("button")!;
    btn.click(); flush();
    expect(session.state.pick).toBe("target_lfo");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    btn.click(); flush();
    expect(session.state.pick).toBeNull();
  });
});

describe("ParamRow", () => {
  beforeEach(() => mount(() => <ParamRow def={NUM} />));
  const dot = () => host.querySelector<HTMLElement>("[data-modified]")!.dataset.modified;

  it("shows label, live icon and value", () => {
    expect(host.textContent).toContain(NUM.label);
    expect(host.querySelector("svg[data-icon]")!.getAttribute("data-icon")).toBe(NUM.icon);
    expect(host.querySelector("[data-testid=value]")!.textContent).toBe(String(NUM.def));
  });

  it("modified dot shows exactly when the value differs from the loaded sound", () => {
    expect(dot()).toBe("false");
    press(slider(), "ArrowRight");
    expect(dot()).toBe("true");
    press(slider(), "ArrowLeft");
    expect(dot()).toBe("false");
  });

  it("the icon is redrawn when the value changes", () => {
    const before = [...host.querySelectorAll("svg path")].map((p) => p.getAttribute("d")).join();
    press(slider(), "End");
    expect([...host.querySelectorAll("svg path")].map((p) => p.getAttribute("d")).join()).not.toBe(before);
  });

  it("reset button restores the default; lock button locks and blocks reset", () => {
    press(slider(), "End");
    host.querySelector<HTMLButtonElement>(`[aria-label="reset ${NUM.label}"]`)!.click(); flush();
    expect(val(NUM)).toBe(NUM.def);
    press(slider(), "End");
    const lock = host.querySelector<HTMLButtonElement>(`[aria-label="lock ${NUM.label}"]`)!;
    lock.click(); flush();
    expect(lock.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector<HTMLButtonElement>(`[aria-label="reset ${NUM.label}"]`)!.disabled).toBe(true);
    press(slider(), "Home");
    expect(val(NUM)).toBe(NUM.max);
  });
});

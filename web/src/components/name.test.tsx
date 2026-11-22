import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { PARAMS } from "../generated/params";
import { factory } from "../model/sound";
import { AppContext, createApp, type App as AppState } from "../state/app";
import { isDirty } from "../state/dirty";
import { SessionContext } from "../state/session";
import { createStatus, StatusContext, type StatusStore } from "../state/status";
import { NameSave } from "./NameSave";

let host: HTMLElement;
let dispose: () => void;
let app: AppState;
let status: StatusStore;

function mount() {
  const clock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };
  const env = { isSecureContext: true, requestMIDIAccess: undefined };
  app = createApp({ storage: localStorage, env, clock, rng: () => 0.5, motionEnv: { now: () => 0, raf: () => 1, caf: () => {}, matchMedia: () => ({ matches: false }) } });
  status = createStatus(clock);
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => (
    <AppContext value={app}><SessionContext value={app.session}><StatusContext value={status}><NameSave /></StatusContext></SessionContext></AppContext>
  ), host);
  flush();
}
const field = () => host.querySelector<HTMLInputElement>("input[aria-label='Sound name']")!;
const buttons = () => [...host.querySelectorAll<HTMLButtonElement>("button")];
const saveBtn = () => buttons().find((b) => ["Save", "Update", "Saved"].includes(b.textContent!.trim()))!;
const caret = () => host.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")!;
const click = (el: Element) => { (el as HTMLElement).click(); flush(); };
const type = (v: string, el: HTMLInputElement = field()) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); flush(); };
const key = (el: Element | Document, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(e);
  flush();
  return e;
};
const focus = () => { field().focus(); field().dispatchEvent(new FocusEvent("focus")); flush(); };
const blur = () => { field().dispatchEvent(new FocusEvent("blur")); flush(); };
const error = () => host.querySelector("[data-testid=name-error]")?.textContent ?? null;
const hint = () => host.querySelector("[data-testid=name-hint]")?.textContent ?? null;
const dot = () => host.querySelector("[aria-label='Unsaved changes']");
const P = PARAMS.find((p) => p.kind === "num" && p.max - p.min >= 4)!;
const edit = () => app.session.applyChanges([[P.id, app.session.state.current.values[P.id]!, app.session.state.current.values[P.id]! + 1]]);

beforeEach(() => { localStorage.clear(); mount(); });
afterEach(() => { dispose(); host.remove(); });

describe("name field (R2.1 to R2.3, R2.12)", () => {
  it("trims, stores a valid name and does not add an undo step; the name makes the sound dirty", () => {
    expect(isDirty(app.session)).toBe(false);
    type("  Kick  ");
    expect(app.session.state.current.name).toBe("Kick");
    expect(app.session.history.canUndo()).toBe(false);
    expect(dot()).toBeTruthy();
  });

  it("empty or spaces: invalid with 'A name is required', Save disabled, not stored", () => {
    const before = app.session.state.current.name;
    type("   ");
    expect(error()).toBe("A name is required");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(saveBtn().disabled).toBe(true);
    expect(app.session.state.current.name).toBe(before);
  });

  it("a name longer than 8 is invalid with the library reason", () => {
    type("abcdefghi");
    expect(error()).toContain("at most 8");
    expect(saveBtn().disabled).toBe(true);
  });

  it("restores the last valid name on blur when empty, and on Escape", () => {
    type("Kick");
    type("");
    blur();
    expect(field().value).toBe("Kick");
    expect(error()).toBeNull();
    type("Snar");
    type("");
    key(field(), "Escape");
    expect(field().value).toBe("Snar");
  });

  it("shows the count only while focused", () => {
    type("Kick");
    expect(host.querySelector("[data-testid=name-count]")).toBeNull();
    focus();
    expect(host.querySelector("[data-testid=name-count]")!.textContent).toBe("4/8");
    blur();
    expect(host.querySelector("[data-testid=name-count]")).toBeNull();
  });
});

describe("Save states (R2.5 to R2.7, R2.10, R2.11)", () => {
  it("Save adds without confirmation, says so in the status, clears the dot and becomes Saved", () => {
    type("Kick1");
    expect(saveBtn().textContent!.trim()).toBe("Save");
    click(saveBtn());
    expect(host.querySelector("[role=alertdialog]")).toBeNull();
    expect(app.library.findByName("Kick1")).toBeTruthy();
    expect(status.current()).toMatchObject({ kind: "success" });
    expect(status.current()!.text).toContain("Kick1");
    expect(dot()).toBeNull();
    expect(saveBtn().textContent!.trim()).toBe("Saved");
    expect(saveBtn().disabled).toBe(true);
  });

  it("a name matching another entry (any case) is Update with the hint; Replace confirms then replaces", () => {
    app.library.add("Kick1", factory("Kick1"));
    const id = app.library.findByName("Kick1")!.id;
    type("kick1");
    expect(saveBtn().textContent!.trim()).toBe("Update");
    expect(hint()).toBe("'Kick1' exists. Save replaces it");
    edit();
    click(saveBtn());
    const dlg = host.querySelector("[role=alertdialog]")!;
    expect(dlg.textContent).toContain("Replace the library sound 'Kick1' with the current sound?");
    click([...dlg.querySelectorAll("button")].find((b) => b.textContent === "Replace")!);
    const e = app.library.get(id)!;
    expect(e.name).toBe("kick1");
    expect(e.params[P.name]).toBe(app.session.state.current.values[P.id]);
    expect(app.library.sounds.length).toBe(1);
    expect(app.session.state.libraryId).toBe(id);
    expect(dot()).toBeNull();
    expect(status.current()!.text).toContain("Updated");
  });

  it("Cancel keeps the entry and the dot", () => {
    app.library.add("Kick1", factory("Kick1"));
    type("Kick1");
    click(saveBtn());
    click([...host.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!);
    expect(host.querySelector("[role=alertdialog]")).toBeNull();
    expect(dot()).toBeTruthy();
  });

  it("Enter presses Save when enabled; Ctrl+S and Cmd+S do too and prevent the browser dialog", () => {
    type("Aa");
    expect(key(field(), "Enter").defaultPrevented).toBe(true);
    expect(app.library.findByName("Aa")).toBeTruthy();
    type("Bb");
    expect(key(document, "s", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(app.library.findByName("Bb")).toBeTruthy();
    type("Cc");
    expect(key(document, "s", { metaKey: true }).defaultPrevented).toBe(true);
    expect(app.library.findByName("Cc")).toBeTruthy();
    // disabled: nothing is added but the browser dialog is still blocked
    type("");
    const n = app.library.sounds.length;
    expect(key(document, "s", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key(field(), "Enter").defaultPrevented).toBe(true);
    expect(app.library.sounds.length).toBe(n);
  });
});

describe("Rename (R2.8, R2.9)", () => {
  const open = () => { click(caret()); click(host.querySelector("[role=menuitem]")!); };
  const dialog = () => host.querySelector<HTMLElement>("[role=dialog]");
  const input = () => dialog()!.querySelector<HTMLInputElement>("input")!;
  const rename = () => [...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "Rename")!;

  it("is disabled without a loaded entry", () => {
    click(caret());
    expect((host.querySelector("[role=menuitem]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("rejects empty and other entries' names, accepts a capitalisation change, disables when unchanged", () => {
    app.library.add("Other", factory("Other"));
    type("Kick1");
    click(saveBtn());
    click(caret());
    expect(host.querySelector("[role=menuitem]")!.textContent).toBe("Rename 'Kick1'…");
    click(host.querySelector("[role=menuitem]")!);
    expect(input().value).toBe("Kick1");
    expect((rename() as HTMLButtonElement).disabled).toBe(true);
    type("", input());
    expect(dialog()!.textContent).toContain("A name is required");
    expect((rename() as HTMLButtonElement).disabled).toBe(true);
    type("other", input());
    expect(dialog()!.textContent).toContain("already exists");
    expect((rename() as HTMLButtonElement).disabled).toBe(true);
    type("KICK1", input());
    expect((rename() as HTMLButtonElement).disabled).toBe(false);
  });

  it("changes only names: value edits stay unsaved, baseline values and history are untouched", () => {
    type("Kick1");
    click(saveBtn());
    edit();
    const values = Uint8Array.from(app.session.state.current.values);
    const baseline = Uint8Array.from(app.session.state.baseline.values);
    const canUndo = app.session.history.canUndo();
    open();
    type("Kick2", input());
    click(rename());
    expect(dialog()).toBeNull();
    expect(app.library.findByName("Kick2")).toBeTruthy();
    expect(app.library.findByName("Kick1")).toBeUndefined();
    expect(app.session.state.current.name).toBe("Kick2");
    expect(app.session.state.baseline.name).toBe("Kick2");
    expect(app.session.state.current.values).toEqual(values);
    expect(app.session.state.baseline.values).toEqual(baseline);
    expect(app.session.history.canUndo()).toBe(canUndo);
    expect(dot()).toBeTruthy(); // the value edit is still unsaved
    expect(field().value).toBe("Kick2");
    expect(status.current()!.text).toContain("Kick2");
  });

  it("renaming a clean sound leaves it clean; Escape closes the dialog", () => {
    type("Kick1");
    click(saveBtn());
    open();
    type("Kick2", input());
    key(input(), "Enter");
    expect(dot()).toBeNull();
    open();
    key(input(), "Escape");
    expect(dialog()).toBeNull();
  });
});

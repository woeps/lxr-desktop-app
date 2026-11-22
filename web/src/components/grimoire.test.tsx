import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { App } from "../App";
import { createApp, type App as AppState } from "../state/app";
import { exportJson } from "../files/json";
import { factory } from "../model/sound";
import { PARAMS } from "../generated/params";

let host: HTMLElement;
let dispose: () => void;
let app: AppState;
let out: number[][];
let timers: { fn: () => void; at: number }[];
let now = 0;
let downloads: { name: string; blobSize: number }[];

function advance(ms: number) {
  const end = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    timers.splice(timers.indexOf(due), 1);
    now = Math.max(now, due.at);
    due.fn();
    flush();
  }
  now = end;
  flush();
}

async function mount(connect = true) {
  out = []; timers = []; now = 0; downloads = [];
  const clock = {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => { const t = { fn, at: now + ms }; timers.push(t); return t; },
    clearTimeout: (h: unknown) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1); },
  };
  const port = { id: "p1", name: "Fake out", send: (d: number[]) => { out.push(d); } };
  const env = {
    isSecureContext: true,
    requestMIDIAccess: async () => ({ outputs: { values: () => [port] }, onstatechange: null }),
  };
  app = createApp({ storage: localStorage, env, clock, rng: () => 0.9 });
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <App app={app} />, host);
  flush();
  if (connect) {
    click(button("Connect"));
    await Promise.resolve(); await Promise.resolve(); flush();
    advance(0);
  }
  out.length = 0;
}
const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent!.trim() === name)!;
const click = (el: Element) => { (el as HTMLElement).click(); flush(); };
const input = (label: string) => host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
function type(el: HTMLInputElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
}
const names = () => [...host.querySelectorAll("li[data-sound]")].map((li) => li.getAttribute("data-sound"));
const openGrimoire = () => click(button("Grimoire"));

const WIDE = PARAMS.find((p) => p.max - p.min >= 20)!;
function sound(name: string, v0 = 0) {
  const s = factory(name);
  s.values[WIDE.id] = v0 + 3;
  return s;
}

async function pickFile(file: File) {
  const el = input("Sound files");
  Object.defineProperty(el, "files", { value: [file], configurable: true });
  el.dispatchEvent(new Event("change", { bubbles: true }));
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 5)); flush(); }
}

beforeEach(() => {
  localStorage.clear();
  URL.createObjectURL = (() => "blob:x") as never;
  URL.revokeObjectURL = (() => {}) as never;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blobSize: 0 });
  });
});
afterEach(() => { dispose(); host.remove(); vi.restoreAllMocks(); });

describe("Grimoire", () => {
  it("warns about storage, shows an empty list and closes", async () => {
    await mount();
    openGrimoire();
    expect(host.querySelector("[data-testid=storage-warning]")!.textContent).toContain("can clear");
    expect(host.querySelector("[data-testid=library-empty]")).toBeTruthy();
    click(button("Close Grimoire"));
    expect(host.querySelector("aside")).toBeNull();
  });

  it("sorts and filters by name and tag", async () => {
    await mount();
    app.library.add("Bravo", sound("Bravo"), ["kick"]);
    app.library.add("Alpha", sound("Alpha"), ["snare"]);
    openGrimoire();
    expect(names()).toEqual(["Alpha", "Bravo"]);
    type(input("Filter by name or tag"), "kic");
    expect(names()).toEqual(["Bravo"]);
    type(input("Filter by name or tag"), "zzz");
    expect(names()).toEqual([]);
    expect(host.querySelector("[data-testid=library-empty]")!.textContent).toContain("match");
  });

  it("loads a sound and sends it in full when nothing is unsaved", async () => {
    await mount();
    app.library.add("Alpha", sound("Alpha", 5));
    openGrimoire();
    click(button("Load Alpha"));
    expect(host.querySelector("[role=alertdialog]")).toBeNull();
    expect(app.session.state.current.name).toBe("Alpha");
    expect(app.session.state.current.values[WIDE.id]).toBe(8);
    advance(2000);
    expect(out.length).toBeGreaterThan(PARAMS.length / 2);
  });

  it("asks before discarding unsaved edits; Cancel keeps them, Confirm loads", async () => {
    await mount();
    app.library.add("Alpha", sound("Alpha", 5));
    app.session.applyChanges([[WIDE.id, 0, 19]]);
    openGrimoire();
    click(button("Load Alpha"));
    expect(host.querySelector("[role=alertdialog]")!.textContent).toContain("not saved");
    click(button("Cancel"));
    expect(app.session.state.current.values[WIDE.id]).toBe(19);
    click(button("Load Alpha"));
    click(button("Discard edits and load"));
    expect(host.querySelector("[role=alertdialog]")).toBeNull();
    expect(app.session.state.current.values[WIDE.id]).toBe(8);
  });

  it("sends a library sound without making it current", async () => {
    await mount();
    app.library.add("Alpha", sound("Alpha", 5));
    openGrimoire();
    const before = app.session.state.current.name;
    click(button("Send Alpha to module"));
    advance(2000);
    expect(out.length).toBeGreaterThan(PARAMS.length / 2);
    expect(app.session.state.current.name).toBe(before);
    expect(app.session.state.moduleInSync).toBe(false);
  });

  it("disables Send without an output", async () => {
    await mount(false);
    app.library.add("Alpha", sound("Alpha"));
    openGrimoire();
    expect(button("Send Alpha to module").disabled).toBe(true);
  });

  it("renames, refusing a bad name", async () => {
    await mount();
    app.library.add("Alpha", sound("Alpha"));
    openGrimoire();
    click(button("Rename Alpha"));
    type(input("New name for Alpha"), "far too long name");
    click(button("Save name"));
    expect(host.querySelector("[role=alert]")!.textContent).toMatch(/at most 8/);
    type(input("New name for Alpha"), "Zulu");
    click(button("Save name"));
    expect(names()).toEqual(["Zulu"]);
  });

  it("deletes only after confirmation", async () => {
    await mount();
    app.library.add("Alpha", sound("Alpha"));
    openGrimoire();
    expect(Array.from(host.querySelectorAll("button")).some((b) => /^Duplicate/.test(b.textContent ?? ""))).toBe(false);
    click(button("Delete Alpha"));
    click(button("Cancel"));
    expect(names().length).toBe(1);
    click(button("Delete Alpha"));
    click(button("Delete"));
    expect(names().length).toBe(0);
    expect(app.library.sounds.length).toBe(0);
  });

  it("adds and removes tags", async () => {
    await mount();
    app.library.add("Alpha", sound("Alpha"));
    openGrimoire();
    type(input("New tag for Alpha"), "bass");
    click(button("Add tag to Alpha"));
    expect(app.library.sounds[0]!.tags).toEqual(["bass"]);
    click(button("×"));
    expect(app.library.sounds[0]!.tags).toEqual([]);
  });

  it("exports one sound and the whole library as files", async () => {
    await mount(false);
    app.library.add("Alpha", sound("Alpha"));
    openGrimoire();
    click(button("Export Alpha"));
    click(button("Export library"));
    expect(downloads.map((d) => d.name)).toEqual(["Alpha.json", "lxr-library.json"]);
  });
});

describe("ImportDialog", () => {
  const open = () => { openGrimoire(); click(button("Import…")); };

  it("lists a JSON file, changes nothing until confirmed, then adds the ticked sounds", async () => {
    await mount(false);
    const text = exportJson([
      { name: "One", tags: ["a"], created: "2026-01-01T00:00:00Z", modified: "2026-01-01T00:00:00Z", params: { [PARAMS[0]!.name]: 999, bogus: 1 } },
      { name: "Two", tags: [], created: "2026-01-01T00:00:00Z", modified: "2026-01-01T00:00:00Z", params: {} },
    ]);
    open();
    await pickFile(new File([text], "set.json"));
    expect(app.library.sounds.length).toBe(0);
    const notes = [...host.querySelectorAll("[data-testid=import-note]")].map((n) => n.textContent).join("|");
    expect(notes).toContain("unknown parameters ignored: bogus");
    expect(notes).toContain("clamped");
    expect(notes).toContain("missing parameters");
    click(host.querySelector<HTMLInputElement>("[aria-label='Add set.json: Two']")!);
    click(button("Add selected to library"));
    expect(app.library.sounds.map((s) => s.name)).toEqual(["One"]);
    expect(app.library.sounds[0]!.tags).toEqual(["a"]);
    expect(host.querySelector("[data-testid=import-result]")!.textContent).toContain("Added 1 sound");
  });

  it("reads a .SND kit and requires a valid name before adding", async () => {
    await mount(false);
    const bytes = new Uint8Array(8 + 247);
    bytes.set([...new TextEncoder().encode("Kit")]);
    open();
    await pickFile(new File([bytes], "KIT.SND"));
    const add = button("Add selected to library");
    expect(add.disabled).toBe(false);
    type(input("Name of KIT.SND sound"), "");
    expect(button("Add selected to library").disabled).toBe(true);
    expect(host.querySelector("[role=alert]")!.textContent).toMatch(/at least 1/);
    type(input("Name of KIT.SND sound"), "Kit 2");
    click(button("Add selected to library"));
    expect(app.library.sounds.map((s) => s.name)).toEqual(["Kit 2"]);
  });

  it("numbers names repeated inside a batch, and lists existing names unticked", async () => {
    await mount(false);
    app.library.add("Old", sound("Old", 1));
    const e = (name: string) => ({ name, tags: [], created: "2026-01-01T00:00:00Z", modified: "2026-01-01T00:00:00Z", params: {} });
    open();
    await pickFile(new File([exportJson([e("Dup"), e("dup"), e("OLD")])], "set.json"));
    const boxes = () => [...host.querySelectorAll<HTMLInputElement>("[role=dialog] input[type=checkbox]")];
    expect([...host.querySelectorAll<HTMLInputElement>("input[aria-label^='Name of']")].map((i) => i.value)).toEqual(["Dup", "dup2", "OLD"]);
    expect(boxes().map((b) => b.checked)).toEqual([true, true, false]);
    expect(host.querySelectorAll("[data-testid=import-exists]").length).toBe(1);
  });

  it("replaces an existing sound only after one confirmation for the batch", async () => {
    await mount(false);
    app.library.add("Old", sound("Old", 1));
    const before = JSON.stringify(app.library.sounds[0]!.params);
    const e = (name: string, v: number) => ({ name, tags: [], created: "2026-01-01T00:00:00Z", modified: "2026-01-01T00:00:00Z", params: { [PARAMS[0]!.name]: v } });
    open();
    await pickFile(new File([exportJson([e("OLD", 2), e("New", 0)])], "set.json"));
    click(host.querySelector<HTMLInputElement>("[aria-label='Add set.json: OLD']")!);
    click(button("Add selected to library"));
    expect(host.querySelector("[role=alertdialog]")).not.toBeNull();
    expect(app.library.sounds.map((x) => x.name)).toEqual(["Old"]);
    click(button("Cancel"));
    expect(JSON.stringify(app.library.sounds[0]!.params)).toBe(before);
    click(button("Add selected to library"));
    click(button("Replace sounds"));
    expect(app.library.sounds.map((x) => x.name).sort()).toEqual(["New", "OLD"]);
    expect(app.library.sounds.length).toBe(2);
  });

  it("refuses other file types and bad JSON with a message", async () => {
    await mount(false);
    open();
    await pickFile(new File(["x"], "a.PAT"));
    expect(host.querySelector("[role=alert]")!.textContent).toContain("only .json");
    await pickFile(new File(["{"], "b.json"));
    expect(host.querySelector("[role=alert]")!.textContent).toContain("not a JSON file");
  });
});

describe("MidiSetupDialog", () => {
  it("states that the settings are not sent and saves the changes", async () => {
    await mount(false);
    click(button("MIDI setup"));
    expect(host.querySelector("[role=dialog]")!.textContent).toContain("not sent to it");
    type(input("Channel Drum 1"), "9");
    type(input("Global channel"), "4");
    type(input("Note Snare"), "40");
    click(button("Save setup"));
    expect(host.querySelector("[role=dialog]")).toBeNull();
    expect(app.settings.state.channels[0]).toBe(9);
    expect(app.settings.state.global).toBe(4);
    expect(app.settings.state.notes[3]).toBe(40);
  });

  it("Cancel leaves the settings alone", async () => {
    await mount(false);
    const before = app.settings.state.channels[0];
    click(button("MIDI setup"));
    type(input("Channel Drum 1"), "9");
    click(button("Cancel"));
    expect(app.settings.state.channels[0]).toBe(before);
  });
});

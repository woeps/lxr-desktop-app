import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { PARAMS } from "../generated/params";
import { exportSnd } from "../files/snd";
import { factory } from "../model/sound";
import { AppContext, createApp, type App as AppState } from "../state/app";
import { createImporter, type Importer } from "../state/importer";
import { PresetImporter } from "./PresetImporter";

let host: HTMLElement;
let dispose: () => void;
let app: AppState;
let imp: Importer;
let out: number[][];
let timers: { fn: () => void; at: number }[];
let now = 0;

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
const settle = async () => { for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 2)); flush(); } };

async function mount(connect: boolean) {
  localStorage.clear();
  out = []; timers = []; now = 0;
  const clock = {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => { const t = { fn, at: now + ms }; timers.push(t); return t; },
    clearTimeout: (h: unknown) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1); },
  };
  const port = { id: "p1", name: "Fake out", send: (d: number[]) => { out.push(d); } };
  const env = { isSecureContext: true, requestMIDIAccess: async () => ({ outputs: { values: () => [port] }, onstatechange: null }) };
  app = createApp({ storage: localStorage, env, clock, rng: () => 0.9 });
  imp = createImporter(app, clock);
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <AppContext value={app}><PresetImporter importer={imp} onClose={() => {}} /></AppContext>, host);
  flush();
  if (connect) {
    await app.conn.connect();
    await Promise.resolve(); flush();
    advance(0);
  }
  out.length = 0;
}
const buttons = () => [...host.querySelectorAll<HTMLButtonElement>("button")];
const button = (name: string) => buttons().find((b) => b.textContent!.trim() === name)!;
const click = (el: Element) => { (el as HTMLElement).click(); flush(); };
const input = (label: string) => host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
const hint = () => host.querySelector("[data-testid=importer-hint]")!;
const rows = () => [...host.querySelectorAll<HTMLButtonElement>("button[data-select]")];

function snd(name: string, seed: number): File {
  const s = factory(name);
  PARAMS.filter((p) => p.max >= 3 && !p.inert).forEach((p, i) => { s.values[p.id] = (seed + i) % (p.max + 1); });
  return new File([exportSnd(s).slice()], `${name}.SND`);
}
function pick(label: string, files: File[], paths?: string[]) {
  const el = input(label);
  files.forEach((f, i) => { if (paths) Object.defineProperty(f, "webkitRelativePath", { value: paths[i] }); });
  Object.defineProperty(el, "files", { value: files, configurable: true });
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return settle();
}
const kitFolder = () => {
  const kits = ["Aaa", "Bbb", "Ccc"].map((n, i) => snd(n, i + 1));
  const other = [new File([new Uint8Array(4)], "x.PAT"), new File([new Uint8Array(4)], "y.NFO")];
  const files = [...kits, ...other];
  return { files, paths: files.map((f) => `Kits/${f.name}`) };
};

afterEach(() => { dispose(); host.remove(); });

describe("PresetImporter", () => {
  beforeEach(() => mount(true));

  it("lists a folder with its summary line", async () => {
    const k = kitFolder();
    await pick("Open folder", k.files, k.paths);
    expect(host.querySelector("[data-testid=importer-summary]")!.textContent).toBe("3 presets, 2 files ignored");
    expect(rows().length).toBe(3);
    expect(rows().every((r) => r.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("refuses a single .PAT file and keeps the list", async () => {
    const k = kitFolder();
    await pick("Open folder", k.files, k.paths);
    await pick("Open files", [new File([new Uint8Array(4)], "song.PAT")]);
    expect(host.querySelector("[role=alert]")!.textContent).toContain("only kit files");
    expect(rows().length).toBe(3);
    expect(host.querySelector("[role=alertdialog]")).toBeNull();
  });

  it("selects on click and announces the sent hint", async () => {
    await pick("Open files", [snd("Aaa", 1), snd("Bbb", 2)]);
    click(rows()[1]!);
    expect(rows()[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(app.session.state.current.name).toBe("Bbb");
    advance(300);
    for (let i = 0; i < 50 && !hint().textContent; i++) advance(50);
    expect(hint().getAttribute("role")).toBe("status");
    expect(hint().textContent).toContain("Bbb sent. Live only, not stored on the module");
  });

  it("steps with Down and Up and moves focus", async () => {
    await pick("Open files", [snd("Aaa", 1), snd("Bbb", 2), snd("Ccc", 3)]);
    click(rows()[0]!);
    rows()[0]!.focus();
    rows()[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    flush();
    expect(rows()[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(rows()[1]);
    rows()[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    flush();
    expect(document.activeElement).toBe(rows()[0]);
  });

  it("asks before replacing a non-empty list", async () => {
    await pick("Open files", [snd("Aaa", 1), snd("Bbb", 2)]);
    await pick("Open files", [snd("Ccc", 3)]);
    expect(host.querySelector("[role=alertdialog]")!.textContent).toContain("Replace the list of 2 presets?");
    click(button("Cancel"));
    expect(rows().length).toBe(2);
    await pick("Open files", [snd("Ccc", 3)]);
    click(button("Replace list"));
    await settle();
    expect(rows().length).toBe(1);
  });

  it("asks before discarding unsaved edits when selecting", async () => {
    await pick("Open files", [snd("Aaa", 1), snd("Bbb", 2)]);
    click(rows()[0]!);
    const p = PARAMS.find((x) => x.max - x.min >= 20)!;
    app.session.applyChanges([[p.id, app.session.state.current.values[p.id]!, p.min === 0 ? 19 : p.min]]);
    flush();
    click(rows()[1]!);
    expect(host.querySelector("[role=alertdialog]")!.textContent).toContain("not saved");
    expect(rows()[1]!.getAttribute("aria-pressed")).toBe("false");
    click(button("Discard edits and select"));
    expect(rows()[1]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows a name with markup as text", async () => {
    await pick("Open files", [snd("<b>x</b>", 1)]);
    expect(host.querySelector("b")).toBeNull();
    expect(rows()[0]!.textContent).toContain("<b>x</b>");
  });
});

describe("PresetImporter without an output", () => {
  beforeEach(() => mount(false));
  it("disables Send again", async () => {
    await pick("Open files", [snd("Aaa", 1)]);
    click(rows()[0]!);
    expect(button("Send again").disabled).toBe(true);
    expect(hint().textContent).toContain("Connect a MIDI output");
  });
});

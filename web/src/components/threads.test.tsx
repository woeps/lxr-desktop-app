import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { PARAMS } from "../generated/params";
import { AppContext, createApp, type App } from "../state/app";
import { SessionContext } from "../state/session";
import { targetIndex } from "../model/links";
import { JourneyPage } from "./JourneyPage";

const id = (name: string) => PARAMS.find((p) => p.name === name)!;
let host: HTMLElement;
let dispose: () => void;
let app: App;

async function mount(voice: 0 | 1 | 2 | 3 | 4 | 5 = 0) {
  const clock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };
  app = createApp({ storage: localStorage, env: { isSecureContext: true } as never, clock, rng: () => 0.5 });
  app.session.setPage(voice);
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(
    () => <AppContext value={app}><SessionContext value={app.session}><JourneyPage voice={voice} /></SessionContext></AppContext>,
    host,
  );
  flush();
  await Promise.resolve();
  flush();
}
const bind = (name: string, targetName: string) => {
  const d = id(name);
  app.session.applyChanges([[d.id, d.def, d.min + targetIndex(id(targetName).id)]]);
  flush();
};
const row = (name: string) => host.querySelector<HTMLElement>(`[data-param=${name}]`)!;

beforeEach(() => localStorage.clear());
afterEach(() => { dispose(); host.remove(); });

describe("threads, badges and pick-to-bind", () => {
  it("shows own badges before incoming ones on a bound row", async () => {
    await mount();
    const target = PARAMS.find((p) => p.voice === 0 && p.station === "trials")!;
    bind("vel_dest_2", target.name); // Oracle of voice 2 acts on voice 1's row
    bind("target_lfo1", target.name);
    const texts = [...row(target.name).querySelectorAll("[data-badge]")].map((b) => b.textContent);
    expect(texts).toEqual(["M1", "O2"]);
  });
  it("marks contested rows and threads", async () => {
    await mount();
    const target = PARAMS.find((p) => p.voice === 0 && p.station === "trials")!;
    bind("target_lfo1", target.name);
    expect(row(target.name).dataset.contested).toBeUndefined();
    bind("vel_dest_1", target.name);
    expect(row(target.name).dataset.contested).toBe("true");
    const threads = host.querySelectorAll("[data-thread]");
    expect(threads).toHaveLength(2);
    expect([...threads].every((t) => t.getAttribute("data-contested") === "true")).toBe(true);
  });
  it("lists modulators of other voices that act on this voice", async () => {
    await mount();
    expect(host.querySelector("[data-part=incoming]")).toBeNull();
    const target = PARAMS.find((p) => p.voice === 0 && p.station === "trials")!;
    bind("target_lfo2", target.name);
    expect(host.querySelector("[data-part=incoming] li")!.textContent).toContain("M2");
  });
  it("Enter on a pickable row binds the Mentor and leaves pick mode", async () => {
    await mount();
    const target = PARAMS.find((p) => p.voice === 0 && p.station === "trials")!;
    app.session.setPick("target_lfo");
    flush();
    const r = row(target.name);
    expect(r.dataset.pickable).toBe("true");
    r.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    flush();
    expect(app.session.state.pick).toBeNull();
    expect(app.session.state.current.values[id("target_lfo1").id]).toBe(id("target_lfo1").min + targetIndex(target.id));
    expect(row(target.name).dataset.pickable).toBeUndefined();
  });
  it("a click binds the Oracle", async () => {
    await mount();
    const target = PARAMS.find((p) => p.voice === 0 && p.station === "forge")!;
    app.session.setPick("vel_dest");
    flush();
    row(target.name).click();
    flush();
    expect(app.session.state.current.values[id("vel_dest_1").id]).toBe(id("vel_dest_1").min + targetIndex(target.id));
  });
  it("Esc cancels pick mode without binding", async () => {
    await mount();
    const before = app.session.state.current.values[id("target_lfo1").id];
    app.session.setPick("target_lfo");
    flush();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    flush();
    expect(app.session.state.pick).toBeNull();
    expect(app.session.state.current.values[id("target_lfo1").id]).toBe(before);
  });
});

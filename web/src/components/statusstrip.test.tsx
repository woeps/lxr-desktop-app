import { afterEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { createApp } from "../state/app";
import { AppContext } from "../state/app";
import { createStatus, StatusContext, SUCCESS_MS, type StatusStore } from "../state/status";
import { StatusStrip } from "./StatusStrip";

let host: HTMLElement;
let dispose: () => void;
let t = 0;
let timers: { at: number; fn: () => void }[] = [];
const clock = {
  now: () => t,
  setTimeout: (fn: () => void, ms: number) => { const h = { at: t + ms, fn }; timers.push(h); return h; },
  clearTimeout: (h: unknown) => { timers = timers.filter((x) => x !== h); },
};
const advance = (ms: number) => {
  t += ms;
  const due = timers.filter((x) => x.at <= t);
  timers = timers.filter((x) => x.at > t);
  due.forEach((x) => x.fn());
  flush();
};

function mount(): StatusStore {
  t = 0; timers = [];
  const status = createStatus(clock);
  const app = createApp({ storage: localStorage, clock, env: { isSecureContext: true }, rng: () => 0.5 });
  host = document.createElement("div");
  document.body.appendChild(host);
  dispose = render(() => <AppContext value={app}><StatusContext value={status}><StatusStrip /></StatusContext></AppContext>, host);
  flush();
  return status;
}
const strip = () => host.querySelector<HTMLElement>("[data-status-strip]");
afterEach(() => { dispose(); host.remove(); });

describe("StatusStrip", () => {
  it("is absent when there is nothing to show", () => {
    mount();
    expect(strip()).toBeNull();
  });

  it("a success message uses role status and disappears after 5 s", () => {
    const s = mount();
    s.say({ kind: "success", text: "Saved 'A'." });
    flush();
    expect(strip()!.querySelector("[role=status]")!.textContent).toContain("Saved 'A'.");
    expect(strip()!.getAttribute("data-kind")).toBe("success");
    advance(SUCCESS_MS);
    expect(strip()).toBeNull();
  });

  it("hover pauses the timer and leaving restarts it", () => {
    const s = mount();
    s.say({ kind: "success", text: "Saved" });
    flush();
    strip()!.dispatchEvent(new Event("pointerenter"));
    advance(60_000);
    expect(strip()).not.toBeNull();
    strip()!.dispatchEvent(new Event("pointerleave"));
    advance(SUCCESS_MS);
    expect(strip()).toBeNull();
  });

  it("an error uses role alert, stays, shows its action and can be dismissed", () => {
    const s = mount();
    let ran = false;
    s.say({ kind: "error", text: "Disconnected", action: { label: "Open connection", run: () => { ran = true; } } });
    flush();
    advance(60_000);
    expect(strip()!.querySelector("[role=alert]")!.textContent).toContain("Disconnected");
    expect(strip()!.getAttribute("data-kind")).toBe("error");
    [...strip()!.querySelectorAll("button")].find((b) => b.textContent === "Open connection")!.click();
    expect(ran).toBe(true);
    strip()!.querySelector<HTMLElement>("[aria-label=Dismiss]")!.click();
    flush();
    expect(strip()).toBeNull();
  });
});

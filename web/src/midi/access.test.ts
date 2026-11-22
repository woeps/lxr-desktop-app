import { describe, expect, it } from "vitest";
import {
  createMidiConnection, MSG_DENIED, MSG_DISCONNECTED, MSG_INSECURE, MSG_UNSUPPORTED, SETTINGS_KEY,
  type MidiAccessLike, type MidiEnv, type MidiPortLike,
} from "./access";
import type { MidiSetup } from "./encode";
import type { Clock } from "./sender";

const setup: MidiSetup = { channels: [1, 2, 3, 4, 5, 6, 7], global: 0, notes: [36, 0, 0, 0, 0, 0, 0] };
const clock: Clock = { now: () => 1000, setTimeout: () => 0, clearTimeout: () => {} };

function port(id: string, name: string) {
  const sent: { data: number[]; t?: number }[] = [];
  const p: MidiPortLike = { id, name, send: (data, t) => { sent.push({ data, t }); } };
  return { p, sent };
}

function fakeAccess(list: MidiPortLike[]) {
  const ports = new Map(list.map((p) => [p.id, p]));
  const access: MidiAccessLike = { outputs: { values: () => ports.values() }, onstatechange: null };
  return {
    access,
    plug: (p: MidiPortLike) => { ports.set(p.id, p); access.onstatechange?.({}); },
    unplug: (id: string) => { ports.delete(id); access.onstatechange?.({}); },
  };
}

function make(env: Partial<MidiEnv>, store: Storage = localStorage) {
  return createMidiConnection({ isSecureContext: true, ...env }, store, clock, () => setup);
}

describe("midi access", () => {
  it("says so in an insecure context and does not call requestMIDIAccess", async () => {
    let called = false;
    const c = make({ isSecureContext: false, requestMIDIAccess: async () => { called = true; return fakeAccess([]).access; } });
    await c.connect();
    expect(c.status()).toBe("insecure");
    expect(c.message()).toBe(MSG_INSECURE);
    expect(called).toBe(false);
  });

  it("names the supported browsers when requestMIDIAccess is missing", async () => {
    const c = make({});
    await c.connect();
    expect(c.status()).toBe("unsupported");
    expect(c.message()).toBe(MSG_UNSUPPORTED);
    expect(MSG_UNSUPPORTED).toMatch(/Chrome, Edge or Opera/);
  });

  it("reports permission denied and requests no sysex", async () => {
    let opts: unknown;
    const c = make({ requestMIDIAccess: async (o) => { opts = o; throw new DOMException("no", "SecurityError"); } });
    await c.connect();
    expect(c.status()).toBe("denied");
    expect(c.message()).toBe(MSG_DENIED);
    expect(opts).toEqual({ sysex: false });
  });

  it("lists outputs by name and chooses the first when nothing is saved", async () => {
    localStorage.clear();
    const f = fakeAccess([port("a", "Alpha").p, port("b", "Beta").p]);
    const c = make({ requestMIDIAccess: async () => f.access });
    await c.connect();
    expect(c.status()).toBe("ready");
    expect(c.outputs()).toEqual([{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }]);
    expect(c.selected()).toEqual({ id: "a", name: "Alpha" });
  });

  it("saves the choice and selects it again on reload", async () => {
    localStorage.clear();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ other: 1 }));
    const f = fakeAccess([port("a", "Alpha").p, port("b", "Beta").p]);
    const c1 = make({ requestMIDIAccess: async () => f.access });
    await c1.connect();
    c1.select("b");
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toEqual({ other: 1, output: { id: "b", name: "Beta" } });
    const c2 = make({ requestMIDIAccess: async () => f.access });
    await c2.connect();
    expect(c2.selected()).toEqual({ id: "b", name: "Beta" });
  });

  it("does not fall back to another device when the saved output is missing", async () => {
    localStorage.clear();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ output: { id: "gone", name: "Gone" } }));
    const f = fakeAccess([port("a", "Alpha").p]);
    const c = make({ requestMIDIAccess: async () => f.access });
    await c.connect();
    expect(c.selected()).toBeNull();
    expect(c.output()).toBeNull();
    expect(c.message()).toBe(MSG_DISCONNECTED);
    expect(c.saved()).toEqual({ id: "gone", name: "Gone" });
    expect(c.testNote()).toBe(false);
  });

  it("follows hot-plug: list updates, disconnect shows Disconnected, same output returning is chosen again", async () => {
    localStorage.clear();
    const a = port("a", "Alpha");
    const f = fakeAccess([a.p]);
    const c = make({ requestMIDIAccess: async () => f.access });
    let changes = 0;
    c.onChange(() => changes++);
    await c.connect();
    expect(c.selected()?.id).toBe("a");

    const b = port("b", "Beta");
    f.plug(b.p);
    expect(c.outputs().map((o) => o.id)).toEqual(["a", "b"]);
    expect(c.selected()?.id).toBe("a");

    f.unplug("a");
    expect(c.outputs().map((o) => o.id)).toEqual(["b"]);
    expect(c.selected()).toBeNull();
    expect(c.message()).toBe(MSG_DISCONNECTED);

    f.plug(a.p);
    expect(c.selected()?.id).toBe("a");
    expect(c.message()).toBeNull();
    expect(changes).toBeGreaterThanOrEqual(4);
  });

  it("Test note sends note on, then note off 100 ms later, through the chosen output", async () => {
    localStorage.clear();
    const a = port("a", "Alpha");
    const b = port("b", "Beta");
    const f = fakeAccess([a.p, b.p]);
    const c = make({ requestMIDIAccess: async () => f.access });
    await c.connect();
    c.select("b");
    expect(c.testNote()).toBe(true);
    expect(a.sent).toEqual([]);
    expect(b.sent).toEqual([
      { data: [0x90, 36, 100], t: 1000 },
      { data: [0x80, 36, 0], t: 1100 },
    ]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { createMidiConnection, SETTINGS_KEY } from "../midi/access";
import { createSettings, defaultSettings, DEFAULT_KEYS } from "./settings";

beforeEach(() => localStorage.clear());

describe("settings", () => {
  it("defaults match the firmware MIDI settings (R2.1) and R4", () => {
    const s = createSettings(localStorage);
    expect(s.state.channels).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.state.global).toBe(0);
    expect(s.state.notes).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(s.state.keys).toEqual([...DEFAULT_KEYS]);
    expect(s.state.velocity).toBe(100);
    expect(s.state.pitch).toBe(60);
    expect(s.state.pauseMotion).toBe(false);
    expect(s.midiSetup()).toEqual({ channels: [1, 2, 3, 4, 5, 6, 7], global: 0, notes: [0, 0, 0, 0, 0, 0, 0] });
  });

  it("persists and restores", () => {
    const a = createSettings(localStorage);
    a.set({ channels: [9, 2, 3, 4, 5, 6, 7], global: 10, velocity: 64, pitch: 48, pauseMotion: true,
      keys: ["a", "s", "d", "f", "g", "h", "j", "k"] });
    const b = createSettings(localStorage);
    expect(b.state.channels[0]).toBe(9);
    expect(b.state.global).toBe(10);
    expect(b.state.velocity).toBe(64);
    expect(b.state.pitch).toBe(48);
    expect(b.state.pauseMotion).toBe(true);
    expect(b.state.keys[7]).toBe("k");
  });

  it("falls back to defaults on corrupt JSON", () => {
    for (const bad of ["{not json", "null", "[1,2]", '"x"']) {
      localStorage.setItem(SETTINGS_KEY, bad);
      expect(createSettings(localStorage).state).toEqual(defaultSettings());
    }
  });

  it("falls back per field on unknown or out-of-range values", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      channels: [1, 2, 3], global: 99, notes: [0, 0, 0, 0, 0, 0, 200], keys: ["1", "1", "3", "4", "5", "6", "7", "0"],
      velocity: 0, pitch: "x", pauseMotion: "yes", whatever: 1,
    }));
    const s = createSettings(localStorage).state;
    expect(s).toEqual({ ...defaultSettings(), notes: [0, 0, 0, 0, 0, 0, 0] });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ velocity: 127, notes: [0, 0, 0, 0, 0, 0, 200] }));
    const t = createSettings(localStorage).state;
    expect(t.velocity).toBe(127);
    expect(t.notes[6]).toBe(0);
  });

  it("set ignores invalid fields and reset restores defaults", () => {
    const s = createSettings(localStorage);
    s.set({ velocity: 500, pitch: 70 });
    expect(s.state.velocity).toBe(100);
    expect(s.state.pitch).toBe(70);
    s.reset();
    expect(s.state).toEqual(defaultSettings());
  });

  it("keeps the saved MIDI output written by access.ts, and access.ts keeps these settings", () => {
    const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} };
    const port = { id: "o1", name: "Out", send: () => {} };
    const conn = createMidiConnection(
      { isSecureContext: true, requestMIDIAccess: async () => ({ outputs: { values: () => [port] }, onstatechange: null }) },
      localStorage, clock, () => createSettings(localStorage).midiSetup(),
    );
    const s = createSettings(localStorage);
    return conn.connect().then(() => {
      s.set({ velocity: 80 });
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
      expect(stored.output).toEqual({ id: "o1", name: "Out" });
      expect(stored.velocity).toBe(80);
      conn.select(null);
      expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).velocity).toBe(80);
    });
  });
});

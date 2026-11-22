import { describe, expect, it } from "vitest";
import { PARAMS } from "../generated/params";
import { paramById } from "../model/params";
import {
  channelFor, encodeNote, encodePanic, encodeParam, encodeStore, noteFor, outputValue,
  type MidiSetup,
} from "./encode";

const setup: MidiSetup = { channels: [1, 2, 3, 4, 5, 6, 7], global: 0, notes: [0, 0, 0, 0, 0, 0, 0] };
const p = (id: number) => paramById(id)!;
const nrpnBytes = (ch: number, n: number, v: number) => [0xb0 | ch, 99, n >> 7, 0xb0 | ch, 98, n & 0x7f, 0xb0 | ch, 6, v];

describe("encodeParam", () => {
  it("CC for param id 8 is B0 09 vv (CC = id + 1, drum 1 on channel 1)", () => {
    expect(p(8).addr).toEqual({ cc: 9 });
    expect(p(8).voice).toBe(0);
    expect(encodeParam(setup, p(8), 0x45)).toEqual([0xb0, 0x09, 0x45]);
  });
  it("every CC parameter has CC = id + 1", () => {
    for (const d of PARAMS) if ("cc" in d.addr) expect(d.addr.cc).toBe(d.id + 1);
  });
  it("id 126 (voice 6) -> CC 127 on channel 6", () => {
    expect(encodeParam(setup, p(126), 1)).toEqual([0xb5, 127, 1]);
  });
  it("NRPN id 128 (n=0) -> CC 99/98/6 on drum 1's channel", () => {
    expect(encodeParam(setup, p(128), 100)).toEqual([0xb0, 99, 0, 0xb0, 98, 0, 0xb0, 6, 100]);
  });
  it("every parameter with id >= 127 uses CC 99/98/6 with n = id - 128", () => {
    const high = PARAMS.filter((x) => x.id >= 127);
    expect(high.length).toBeGreaterThan(0);
    for (const d of high) expect(encodeParam(setup, d, 5)).toEqual(nrpnBytes(0, d.id - 128, 5));
  });
  it("NRPN parameters never send CC 38 as data entry LSB (id 37 as a plain CC is CC 38)", () => {
    for (const d of PARAMS.filter((x) => "nrpn" in x.addr)) {
      const b = encodeParam(setup, d, 9);
      for (let i = 1; i < b.length; i += 3) expect(b[i]).not.toBe(38);
    }
    expect(encodeParam(setup, p(37), 9)[1]).toBe(38);
  });
  it("clamps and rounds the value to 0..127", () => {
    expect(encodeParam(setup, p(8), 200)[2]).toBe(127);
    expect(encodeParam(setup, p(8), -3)[2]).toBe(0);
    expect(encodeParam(setup, p(8), 3.6)[2]).toBe(4);
  });
});

describe("channel choice", () => {
  it("voice parameters go on their voice's channel", () => {
    const s: MidiSetup = { ...setup, channels: [10, 11, 12, 13, 14, 15, 16] };
    const byVoice = [0, 1, 2, 3, 4, 5].map((v) => PARAMS.find((d) => d.voice === v && "cc" in d.addr)!);
    expect(byVoice.map((d) => channelFor(s, d))).toEqual([9, 10, 11, 12, 13, 14]);
    expect(encodeParam(s, byVoice[5]!, 1)[0]).toBe(0xbe);
  });
  it("global parameter uses drum 1's channel when global is off", () => {
    const g = PARAMS.find((d) => d.voice === -1)!;
    expect(channelFor({ ...setup, channels: [4, 2, 3, 4, 5, 6, 7] }, g)).toBe(3);
  });
  it("global channel set: global params and NRPN use it, CC voice params keep their own", () => {
    const s = { ...setup, global: 16 };
    const g = PARAMS.find((d) => d.voice === -1)!;
    expect(channelFor(s, g)).toBe(15);
    expect(encodeParam(s, p(128), 1)[0]).toBe(0xbf);
    expect(encodeParam(s, p(8), 1)[0]).toBe(0xb0);
  });
});

describe("outputs", () => {
  it("choices are sent as 0/2/3/6", () => {
    expect(outputValue("main")).toBe(0);
    expect(outputValue("left")).toBe(2);
    expect(outputValue("right")).toBe(3);
    expect(outputValue("FX")).toBe(6);
  });
  it("aliases 1/4/5 are sent unchanged", () => {
    const out = p(215);
    const n = (out.addr as { nrpn: number }).nrpn;
    for (const v of [1, 4, 5]) expect(encodeParam(setup, out, v)).toEqual(nrpnBytes(0, out.id - 128, v));
    expect(n).toBe(out.id - 128);
  });
});

describe("notes", () => {
  it("any-note voice plays the default pitch 60", () => {
    const n = encodeNote(setup, 2, 100);
    expect(n.on).toEqual([0x92, 60, 100]);
    expect(n.off).toEqual([0x82, 60, 0]);
  });
  it("pitch control changes the note", () => {
    expect(encodeNote(setup, 0, 1, 72).on).toEqual([0x90, 72, 1]);
  });
  it("fixed trigger note wins over pitch", () => {
    expect(noteFor({ ...setup, notes: [0, 0, 0, 0, 0, 0, 40] }, 6, 72)).toBe(40);
  });
  it("open hi-hat uses midi_chan_7 and midi_note7", () => {
    const s = { ...setup, channels: [1, 2, 3, 4, 5, 6, 9], notes: [0, 0, 0, 0, 0, 0, 46] };
    expect(encodeNote(s, 6, 90).on).toEqual([0x98, 46, 90]);
    expect(encodeNote(s, 6, 90).off).toEqual([0x88, 46, 0]);
  });
});

describe("store", () => {
  it("equals B0 63 7E B0 62 00 B0 06 53 B0 63 7F B0 62 7F on channel 1", () => {
    expect(encodeStore(setup)).toEqual([
      0xb0, 0x63, 0x7e, 0xb0, 0x62, 0x00, 0xb0, 0x06, 0x53, 0xb0, 0x63, 0x7f, 0xb0, 0x62, 0x7f,
    ]);
  });
  it("uses drum 1's channel even when global is set", () => {
    const b = encodeStore({ ...setup, channels: [3, 2, 3, 4, 5, 6, 7], global: 9 });
    expect(b.filter((_, i) => i % 3 === 0)).toEqual([0xb2, 0xb2, 0xb2, 0xb2, 0xb2]);
  });
});

describe("panic", () => {
  it("note off for each held note, no CC 120 or 123", () => {
    const msgs = encodePanic([{ channel: 0, note: 60 }, { channel: 8, note: 46 }]);
    expect(msgs).toEqual([[0x80, 60, 0], [0x88, 46, 0]]);
    for (const m of msgs) expect(m[0]! & 0xf0).toBe(0x80);
  });
  it("sends nothing when nothing is held", () => {
    expect(encodePanic([])).toEqual([]);
  });
});

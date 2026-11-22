import { describe, expect, it } from "vitest";
import { PARAMS } from "../generated/params";
import { VALUES_LENGTH } from "../model/params";
import { BYTE_MS, createSender, type Clock, type Output } from "./sender";
import { encodeParam, type MidiSetup } from "./encode";
import { paramById } from "../model/params";

const setup: MidiSetup = { channels: [1, 2, 3, 4, 5, 6, 7], global: 0, notes: [0, 0, 0, 0, 0, 0, 0] };

function fake() {
  let t = 0;
  let timers: { at: number; fn: () => void; h: number }[] = [];
  let n = 0;
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => { const h = ++n; timers.push({ at: t + ms, fn, h }); return h; },
    clearTimeout: (h) => { timers = timers.filter((x) => x.h !== h); },
  };
  const sent: { bytes: readonly number[]; t: number; atCall: number }[] = [];
  const output: Output = { send: (bytes, at) => sent.push({ bytes, t: at, atCall: t }) };
  /** Advance fake time to `to`, firing timers in order. */
  const advance = (to: number) => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > to) break;
      timers.shift();
      t = Math.max(t, next.at);
      next.fn();
    }
    t = to;
  };
  return { clock, output, sent, advance, now: () => t };
}

const mk = () => {
  const f = fake();
  const s = createSender(() => f.output, () => setup, f.clock);
  return { f, s };
};
// ids: 8 = CC (drum 1), 9 = CC (drum 1)
const cc = (id: number, v: number) => [...encodeParam(setup, paramById(id)!, v)];

describe("sender", () => {
  it("sends in enqueue order", () => {
    const { f, s } = mk();
    s.setParam(8, 1); s.setParam(9, 2); s.setParam(10, 3);
    f.advance(100);
    expect(f.sent.map((x) => x.bytes)).toEqual([cc(8, 1), cc(9, 2), cc(10, 3)]);
  });

  it("two moves of one parameter before it is sent coalesce into one message with the last value, in FIFO position", () => {
    const { f, s } = mk();
    s.sendTransfer(new Uint8Array(VALUES_LENGTH));
    const last = PARAMS.at(-1)!;
    s.setParam(last.id, 11);
    s.setParam(last.id, 99);
    f.advance(2000);
    expect(f.sent.length).toBe(PARAMS.length);
    const tail = f.sent.at(-1)!.bytes;
    expect(tail.at(-1)).toBe(99);
  });

  it("spaces one parameter by at least 10 ms and still sends the final value of a drag", () => {
    const { f, s } = mk();
    for (let i = 0; i < 50; i++) { s.setParam(8, i); f.advance(f.now() + 1); }
    f.advance(1000);
    const mine = f.sent.filter((x) => x.bytes[1] === 9 && x.bytes[0] === 0xb0);
    for (let i = 1; i < mine.length; i++) expect(mine[i]!.t - mine[i - 1]!.t).toBeGreaterThanOrEqual(10);
    expect(mine.length).toBeLessThanOrEqual(9) // 50 moves over 50 ms: one per 10 ms, 30 ms lookahead;
    expect(mine.at(-1)!.bytes[2]).toBe(49);
  });

  it("paces bytes: no send closer than bytes * 376 us to the previous one", () => {
    const { f, s } = mk();
    s.setParam(8, 1); s.setParam(9, 2); s.setParam(128, 3); s.setParam(129, 4);
    f.advance(200);
    expect(f.sent.length).toBe(4);
    for (let i = 1; i < f.sent.length; i++) {
      expect(f.sent[i]!.t - f.sent[i - 1]!.t).toBeGreaterThanOrEqual(f.sent[i - 1]!.bytes.length * BYTE_MS - 1e-9);
    }
  });

  it("never schedules more than 30 ms ahead of the clock", () => {
    const { f, s } = mk();
    s.sendTransfer(new Uint8Array(VALUES_LENGTH));
    f.advance(1000);
    for (const x of f.sent) expect(x.t - x.atCall).toBeLessThanOrEqual(30 + 1e-9);
  });

  it("completes a full-sound transfer in under 2 s of fake time (1314 bytes, about 0.5 s)", () => {
    const { f, s } = mk();
    s.sendTransfer(new Uint8Array(VALUES_LENGTH).fill(64));
    expect(s.transfer()).toEqual({ sent: expect.any(Number), total: PARAMS.length });
    let done = -1;
    for (let ms = 1; ms <= 2000 && done < 0; ms++) {
      f.advance(ms);
      if (s.transfer()!.sent === PARAMS.length) done = ms;
    }
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThan(2000);
    expect(f.sent.reduce((n, x) => n + x.bytes.length, 0)).toBe(1314);
    expect(f.sent.map((x) => x.bytes[1])).toEqual(expect.arrayContaining([9]));
    f.advance(2000);
    expect(s.pending()).toBe(false);
  });

  it("cancel drops unsent entries and pending() reaches 0", () => {
    const { f, s } = mk();
    s.sendTransfer(new Uint8Array(VALUES_LENGTH));
    const before = f.sent.length;
    expect(before).toBeLessThan(PARAMS.length);
    expect(s.pending()).toBe(true);
    s.cancel();
    const afterCancel = f.sent.length;
    f.advance(5000);
    expect(f.sent.length).toBe(afterCancel);
    expect(afterCancel - before).toBeLessThanOrEqual(2);
    expect(s.pending()).toBe(false);
  });

  it("pending() is true while queued or scheduled ahead, false when idle, and onChange fires on the way", () => {
    const { f, s } = mk();
    let changes = 0;
    s.onChange(() => changes++);
    expect(s.pending()).toBe(false);
    s.setParam(8, 1);
    expect(s.pending()).toBe(true); // 3 bytes scheduled ahead
    f.advance(5);
    expect(s.pending()).toBe(false);
    expect(changes).toBeGreaterThanOrEqual(2);
  });

  it("fires the handed-to-output event once per message after the bytes went to the output", () => {
    const { f, s } = mk();
    const events: { id: number; sentSoFar: number }[] = [];
    s.onHandedOff((id) => events.push({ id, sentSoFar: f.sent.length }));
    s.setParam(8, 1); s.setParam(9, 2); s.setParam(8, 3); s.setParam(8, 4);
    f.advance(100);
    expect(events.map((e) => e.id)).toEqual([8, 9, 8, 8]); // one event per message sent
    expect(events.map((e) => e.sentSoFar)).toEqual([1, 2, 3, 4]); // each after its send
  });

  it("transfer fires one event per id", () => {
    const { f, s } = mk();
    const ids: number[] = [];
    s.onHandedOff((id) => ids.push(id));
    s.sendTransfer(new Uint8Array(VALUES_LENGTH));
    f.advance(2000);
    expect(ids).toEqual(PARAMS.map((p) => p.id));
  });

  it("drops entries when there is no output", () => {
    const f = fake();
    const s = createSender(() => null, () => setup, f.clock);
    s.setParam(8, 1);
    f.advance(100);
    expect(f.sent.length).toBe(0);
    expect(s.pending()).toBe(false);
  });

  it("enqueue sends other messages in order after queued parameters", () => {
    const { f, s } = mk();
    s.setParam(8, 1);
    s.enqueue("s", [1, 2, 3]);
    f.advance(100);
    expect(f.sent.map((x) => x.bytes)).toEqual([cc(8, 1), [1, 2, 3]]);
  });
});

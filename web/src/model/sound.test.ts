import { describe, expect, it } from "vitest";
import { PARAMS } from "../generated/params";
import { paramById, paramsOfVoice } from "./params";
import {
  applyChanges, clamp, copyVoice, diff, factory, pasteVoice, randomise, type Rng,
} from "./sound";

/** Small deterministic generator (mulberry32). */
function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const none = new Set<number>();
const find = (voice: 0 | 1 | 2 | 3 | 4 | 5, slotKey: string) =>
  paramsOfVoice(voice).find((p) => p.slotKey === slotKey)!;

describe("params", () => {
  it("looks up by id and rejects unknown ids", () => {
    expect(paramById(1)?.name).toBe("osc_wave_drum1");
    expect(paramById(0)).toBeUndefined();
  });
});

describe("factory", () => {
  it("equals def for every parameter", () => {
    const s = factory();
    for (const p of PARAMS) expect(s.values[p.id]).toBe(p.def);
  });
  it("returns independent sounds", () => {
    const a = factory();
    a.values[8] = 1;
    expect(factory().values[8]).toBe(paramById(8)!.def);
  });
});

describe("clamp", () => {
  it("clamps at min and max, keeps in-range values", () => {
    expect(clamp(8, -5)).toBe(0);
    expect(clamp(8, 200)).toBe(127);
    expect(clamp(8, 64)).toBe(64);
    expect(clamp(8, 0)).toBe(0);
    expect(clamp(8, 127)).toBe(127);
  });
  it("uses the enum range, rounds, and maps NaN to min", () => {
    expect(clamp(1, 9)).toBe(5);
    expect(clamp(244, 3)).toBe(0); // single-value enum
    expect(clamp(8, 3.6)).toBe(4);
    expect(clamp(8, NaN)).toBe(0);
  });
  it("throws on an unknown id", () => {
    expect(() => clamp(0, 1)).toThrow(RangeError);
  });
});

describe("diff", () => {
  it("is empty for equal sounds, ignoring name", () => {
    expect(diff(factory("a"), factory("b"))).toEqual([]);
  });
  it("lists changed ids in ascending order", () => {
    const b = factory();
    b.values[37] = 5;
    b.values[8] = 9;
    expect(diff(factory(), b)).toEqual([8, 37]);
  });
  it("ignores bytes that are not parameter ids", () => {
    const b = factory();
    b.values[0] = 99;
    expect(diff(factory(), b)).toEqual([]);
  });
});

describe("copy and paste by slotKey", () => {
  it("maps between drums 1, 2 and 3", () => {
    const s = factory();
    for (const p of paramsOfVoice(0)) s.values[p.id] = Math.min(p.max, 3);
    s.values[find(0, "filter_freq").id] = 11;
    const clip = copyVoice(s, 0);
    for (const dst of [1, 2] as const) {
      applyChanges(s, pasteVoice(s, dst, clip));
      expect(s.values[find(dst, "filter_freq").id]).toBe(11);
    }
    for (const p of paramsOfVoice(0)) {
      expect(s.values[find(1, p.slotKey).id]).toBe(s.values[p.id]);
      expect(s.values[find(2, p.slotKey).id]).toBe(s.values[p.id]);
    }
  });
  it("copies drum 3 to drum 1 (reverse direction)", () => {
    const s = factory();
    s.values[find(2, "coarse").id] = 99;
    applyChanges(s, pasteVoice(s, 0, copyVoice(s, 2)));
    expect(s.values[find(0, "coarse").id]).toBe(99);
  });
  it("skips locked ids and does not modify the sound itself", () => {
    const s = factory();
    const dst = find(1, "filter_freq");
    s.values[find(0, "filter_freq").id] = 5;
    const before = s.values[dst.id];
    const ch = pasteVoice(s, 1, copyVoice(s, 0), new Set([dst.id]));
    expect(ch.find(([id]) => id === dst.id)).toBeUndefined();
    expect(s.values[dst.id]).toBe(before);
  });
  it("reports only values that change, with before and after", () => {
    const s = factory();
    const clip = copyVoice(s, 0);
    clip.set("filter_freq", 7);
    const id = find(1, "filter_freq").id;
    expect(pasteVoice(s, 1, clip).filter(([i]) => i === id)).toEqual([[id, 127, 7]]);
    expect(pasteVoice(factory(), 1, copyVoice(factory(), 1))).toEqual([]);
  });
  it("skips slotKeys the target voice does not have", () => {
    const clip = copyVoice(factory(), 0);
    clip.set("no_such_slot", 1);
    expect(() => pasteVoice(factory(), 4, clip)).not.toThrow();
  });
  it("clamps pasted values to the target range", () => {
    const ch = pasteVoice(factory(), 0, new Map([["osc_wave", 200]]));
    expect(ch).toEqual([[find(0, "osc_wave").id, 0, 5]]);
  });
});

describe("randomise", () => {
  const voices = [0, 1, 2, 3, 4, 5, -1] as const;
  it("is deterministic with a seeded source", () => {
    const a = randomise(factory(), 3, 1, none, seeded(42));
    const b = randomise(factory(), 3, 1, none, seeded(42));
    const c = randomise(factory(), 3, 1, none, seeded(43));
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
  });
  it("stays in range at amount 1, for every voice and extreme sources", () => {
    for (const v of voices) {
      for (const rng of [() => 0, () => 0.999999, seeded(1), seeded(2)]) {
        for (const [id, , after] of randomise(factory(), v, 1, none, rng)) {
          const p = paramById(id)!;
          expect(after).toBeGreaterThanOrEqual(p.min);
          expect(after).toBeLessThanOrEqual(p.max);
          expect(Number.isInteger(after)).toBe(true);
        }
      }
    }
  });
  it("amount 0 changes nothing", () => {
    for (const v of voices) expect(randomise(factory(), v, 0, none, seeded(7))).toEqual([]);
  });
  it("clamps amount outside 0..1 and treats NaN as 0", () => {
    expect(randomise(factory(), 0, -3, none, seeded(7))).toEqual([]);
    expect(randomise(factory(), 0, NaN, none, seeded(7))).toEqual([]);
    expect(randomise(factory(), 0, 9, none, seeded(7))).toEqual(
      randomise(factory(), 0, 1, none, seeded(7)),
    );
  });
  it("only touches the chosen voice and skips mix, inert and locked", () => {
    const s = factory();
    const lockedId = find(0, "filter_freq").id;
    const ch = randomise(s, 0, 1, new Set([lockedId]), seeded(5));
    expect(ch.length).toBeGreaterThan(0);
    for (const [id] of ch) {
      const p = paramById(id)!;
      expect(p.voice).toBe(0);
      expect(p.mix || p.inert).toBe(false);
      expect(id).not.toBe(lockedId);
    }
    expect(diff(s, factory())).toEqual([]); // input not modified
    const all = new Set(PARAMS.map((p) => p.id));
    expect(randomise(s, 0, 1, all, seeded(5))).toEqual([]);
  });
  it("scales the deviation by amount for numeric parameters", () => {
    const s = factory();
    const p = find(0, "filter_freq");
    s.values[p.id] = 100;
    const half = randomise(s, 0, 0.5, none, () => 0).find(([id]) => id === p.id)!;
    expect(half).toEqual([p.id, 100, 50]);
  });
  it("changes enums only with probability amount", () => {
    const p = find(0, "osc_wave"); // first parameter of voice 0, def 0
    expect(paramsOfVoice(0)[0].id).toBe(p.id);
    const seq = (r1: number, r2: number): Rng => {
      let n = 0;
      return () => (n++ % 2 === 0 ? r1 : r2);
    };
    const hit = randomise(factory(), 0, 0.5, none, seq(0.99, 0.4)).find(([i]) => i === p.id);
    const miss = randomise(factory(), 0, 0.5, none, seq(0.99, 0.6)).find(([i]) => i === p.id);
    expect(hit).toEqual([p.id, 0, 5]);
    expect(miss).toBeUndefined();
  });
});

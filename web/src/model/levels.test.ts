import { describe, expect, it } from "vitest";
import { bridgeOpacity, filterPass, levels, sparkSize, type LevelInput } from "./levels";

const base: LevelInput = { fm: 0.5, filter: "lp", cutoff: 0.5, amp: 1, drive: 0, volume: 1 };
const L = (o: Partial<LevelInput>) => levels({ ...base, ...o });

describe("levels (design 4.12.7)", () => {
  it("L0 is the FM amount, floored at 0.06", () => {
    expect(L({ fm: 0 })[0]).toBe(0.06);
    expect(L({ fm: 0.5 })[0]).toBe(0.5);
    expect(L({ fm: 1 })[0]).toBe(1);
  });
  it("L1 = L2 = 1", () => {
    const l = L({});
    expect(l[1]).toBe(1);
    expect(l[2]).toBe(1);
  });
  it("L3 filter pass: LP, LP2, HP, off, other at min/mid/max cutoff", () => {
    for (const k of ["lp", "lp2"] as const) {
      expect(L({ filter: k, cutoff: 0 })[3]).toBeCloseTo(0.15);
      expect(L({ filter: k, cutoff: 0.5 })[3]).toBeCloseTo(0.575);
      expect(L({ filter: k, cutoff: 1 })[3]).toBeCloseTo(1);
    }
    expect(L({ filter: "hp", cutoff: 0 })[3]).toBeCloseTo(1);
    expect(L({ filter: "hp", cutoff: 0.5 })[3]).toBeCloseTo(0.575);
    expect(L({ filter: "hp", cutoff: 1 })[3]).toBeCloseTo(0.15);
    for (const c of [0, 0.5, 1]) {
      expect(L({ filter: "off", cutoff: c })[3]).toBe(1);
      expect(L({ filter: "other", cutoff: c })[3]).toBe(0.6);
    }
    expect(filterPass("lp", 0.2)).toBeCloseTo(0.32);
  });
  it("L4 = fp * max(0.25, amp)", () => {
    expect(L({ filter: "off", amp: 0 })[4]).toBe(0.25);
    expect(L({ filter: "off", amp: 0.1 })[4]).toBe(0.25);
    expect(L({ filter: "off", amp: 0.5 })[4]).toBe(0.5);
    expect(L({ filter: "other", amp: 1 })[4]).toBeCloseTo(0.6);
    expect(L({ filter: "lp", cutoff: 1, amp: 1 })[4]).toBeCloseTo(1);
  });
  it("L5 = min(1, L4*(1+0.4*drive))", () => {
    expect(L({ filter: "other", amp: 0.5, drive: 0 })[5]).toBeCloseTo(0.3);
    expect(L({ filter: "other", amp: 0.5, drive: 0.5 })[5]).toBeCloseTo(0.36);
    expect(L({ filter: "other", amp: 0.5, drive: 1 })[5]).toBeCloseTo(0.42);
    expect(L({ filter: "off", amp: 1, drive: 1 })[5]).toBe(1);
  });
  it("L6 = L5 * volume", () => {
    expect(L({ filter: "other", amp: 0.5, drive: 1, volume: 0.5 })[6]).toBeCloseTo(0.21);
    expect(L({ filter: "other", amp: 0.5, drive: 1, volume: 1 })[6]).toBeCloseTo(0.42);
  });
  it("cutoff 0 on LP floors L3..L6; volume 0 floors L6", () => {
    const l = L({ filter: "lp", cutoff: 0, amp: 0, drive: 0 });
    expect(l[3]).toBeCloseTo(0.15);
    expect(l[4]).toBeCloseTo(0.0375 + 0.0225);
    const zero = L({ filter: "lp", cutoff: 0, amp: 0, drive: 0, volume: 0 });
    expect(zero[6]).toBe(0.06);
    expect(L({ volume: 0 })[6]).toBe(0.06);
  });
  it("filter off passes 1", () => {
    expect(L({ filter: "off", cutoff: 0 })[3]).toBe(1);
  });
  it("out-of-range and non-finite inputs are clamped", () => {
    const l = L({ fm: 5, cutoff: -3, amp: 9, drive: 9, volume: 9 });
    expect(l[0]).toBe(1);
    expect(l[3]).toBeCloseTo(0.15);
    expect(l[4]).toBeCloseTo(0.15);
    expect(l[5]).toBeCloseTo(0.15 * 1.4);
    expect(L({ fm: -1 })[0]).toBe(0.06);
    expect(L({ fm: NaN })[0]).toBe(0.06);
    for (const v of levels({ fm: 9, filter: "off", cutoff: 9, amp: 9, drive: 9, volume: 9 })) {
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0.06);
    }
  });
  it("opacity and spark size", () => {
    expect(bridgeOpacity(0.06)).toBe(0.35);
    expect(bridgeOpacity(0.6)).toBe(0.6);
    expect(sparkSize(0)).toBe(2);
    expect(sparkSize(1)).toBe(4.5);
  });
});

import { describe, expect, it } from "vitest";
import { MOD_TARGETS, PARAMS } from "../generated/params";
import {
  badgesFor, bindings, contestedIds, incoming, isContested, targetId, targetIndex, targetLabel,
} from "./links";
import { paramById } from "./params";
import { factory } from "./sound";

const id = (name: string) => PARAMS.find((p) => p.name === name)!.id;
const withTargets = (set: Record<string, number>) => {
  const s = factory();
  for (const [name, v] of Object.entries(set)) s.values[id(name)] = v;
  return s;
};
const idx = (name: string) => targetIndex(id(name));

describe("links", () => {
  it("MOD_TARGETS round trips for every public target", () => {
    MOD_TARGETS.forEach((t, i) => {
      if (t === null) return;
      expect(targetId(targetIndex(t)), `index ${i}`).toBe(t);
      expect(paramById(t), `index ${i}`).toBeDefined();
    });
    expect(targetId(999)).toBeNull();
  });

  it("gives twelve unbound bindings on the factory sound", () => {
    const all = bindings(factory().values);
    expect(all).toHaveLength(12);
    expect(all.filter((b) => b.kind === "mentor").map((b) => b.voice)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(all.filter((b) => b.kind === "oracle").map((b) => b.voice)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(all.every((b) => b.target === null)).toBe(true);
  });

  it("reads all twelve modulators from a sound", () => {
    const set: Record<string, number> = {};
    const picks = MOD_TARGETS.map((t, i) => [t, i] as const).filter(([t]) => t !== null && t < 100).slice(0, 12);
    for (let v = 0; v < 6; v++) {
      set[`target_lfo${v + 1}`] = picks[v * 2][1];
      set[`vel_dest_${v + 1}`] = picks[v * 2 + 1][1];
    }
    const all = bindings(withTargets(set).values);
    all.forEach((b, i) => expect(b.target).toBe(picks[i][0]));
    expect(contestedIds(all).size).toBe(0);
  });

  it("treats none (0) and non-public targets as unbound", () => {
    const nonPublic = MOD_TARGETS.findIndex((t, i) => i > 0 && t === null);
    expect(nonPublic).toBeGreaterThan(0);
    const all = bindings(withTargets({ target_lfo1: nonPublic, vel_dest_1: 0 }).values);
    expect(all[0].target).toBeNull();
    expect(all[1].target).toBeNull();
    expect(targetLabel(null)).toBe("none");
    expect(targetLabel(9999)).toBe("none");
  });

  it("badges own and incoming modulators on a row, own first", () => {
    const f1 = id("filter_freq_1");
    const all = bindings(
      withTargets({ target_lfo2: idx("filter_freq_1"), vel_dest_1: idx("filter_freq_1") }).values,
    );
    expect(badgesFor(all, f1, 0)).toEqual([
      { text: "VEL1", kind: "oracle", voice: 0, own: true },
      { text: "LFO2", kind: "mentor", voice: 1, own: false },
    ]);
    expect(badgesFor(all, id("filter_freq_2"), 1)).toEqual([]);
    expect(incoming(all, 0).map((b) => `${b.kind}${b.voice}`)).toEqual(["mentor1"]);
    expect(incoming(all, 1)).toEqual([]);
  });

  it("flags contested only when two modulators share a target", () => {
    const f1 = id("filter_freq_1");
    const one = bindings(withTargets({ target_lfo1: idx("filter_freq_1") }).values);
    expect(isContested(one, f1)).toBe(false);
    expect(contestedIds(one).size).toBe(0);
    const two = bindings(withTargets({ target_lfo1: idx("filter_freq_1"), vel_dest_4: idx("filter_freq_1") }).values);
    expect(isContested(two, f1)).toBe(true);
    expect([...contestedIds(two)]).toEqual([f1]);
    expect(isContested(two, id("filter_freq_2"))).toBe(false);
  });

  it("two unbound modulators are not contested", () => {
    expect(contestedIds(bindings(factory().values)).size).toBe(0);
  });

  it("labels targets as voice › station › label", () => {
    const p = paramById(id("filter_freq_1"))!;
    expect(targetLabel(p.id)).toBe("Drum 1 › Filter › cutoff");
    expect(targetLabel(p.id).endsWith(` › ${p.label}`)).toBe(true);
    expect(targetLabel(id("fx_p1")).startsWith("Cauldron › Effect › ")).toBe(true);
    const noise = PARAMS.find((q) => q.voice === 3 && q.station === "call")!;
    expect(targetLabel(noise.id)).toBe(`Snare › Noise › ${noise.label}`);
    const click = PARAMS.find((q) => q.voice === 5 && q.station === "threshold")!;
    expect(targetLabel(click.id)).toBe(`Hi-hat › Click › ${click.label}`);
    expect(targetLabel(id("filter_freq_6")).startsWith("Hi-hat › ")).toBe(true);
  });

  it("labels the target rows LFO to and Velocity to", () => {
    expect(PARAMS.find((q) => q.name === "target_lfo1")!.label).toBe("LFO to");
    expect(PARAMS.find((q) => q.name === "vel_dest_1")!.label).toBe("Velocity to");
  });
});

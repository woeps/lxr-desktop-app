import { describe, expect, it } from "vitest";
import { PARAMS } from "../generated/params";
import { encodeParam, outputValue } from "../midi/encode";
import { aliasTitle, choiceOf, choicesFor, outParamOf, panDims } from "./outputs";

const p = (n: string) => PARAMS.find((x) => x.name === n)!;
const setup = { channels: [1, 2, 3, 4, 5, 6, 7], global: 0, notes: [0, 0, 0, 0, 0, 0, 0] } as never;

describe("outputs", () => {
  it("St2, L2 and R2 show as main, left and right with a tooltip, and stay unchanged", () => {
    const out = p("audio_out1");
    for (const [stored, label] of [[0, "main"], [1, "main"], [2, "left"], [4, "left"], [3, "right"], [5, "right"], [6, "FX"]] as const) {
      expect(choiceOf(stored).label).toBe(label);
      expect(out.values![stored]).toBeDefined();
    }
    expect(aliasTitle(1)).toBe("plays as main");
    expect(aliasTitle(4)).toBe("plays as left");
    expect(aliasTitle(5)).toBe("plays as right");
    expect(aliasTitle(0)).toBeUndefined();
    // nothing is rewritten: the stored value is what encodeParam sends
    expect(encodeParam(setup, out, 4).at(-1)).toBe(4);
  });
  it("picking main, left, right, FX sends 0, 2, 3, 6", () => {
    expect(["main", "left", "right", "FX"].map((l) => outputValue(l as never))).toEqual([0, 2, 3, 6]);
  });
  it("four choices for a voice, three for fx_routing", () => {
    expect(choicesFor(p("audio_out1")).map((c) => c.label)).toEqual(["main", "left", "right", "FX"]);
    expect(choicesFor(p("fx_routing")).map((c) => c.label)).toEqual(["main", "left", "right"]);
  });
  it("pan dims for left and right (and their aliases) only", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(panDims)).toEqual([false, false, true, true, true, true, false]);
    expect(outParamOf(p("pan2"))!.name).toBe("audio_out2");
    expect(outParamOf(p("vol1"))).toBeUndefined();
  });
});

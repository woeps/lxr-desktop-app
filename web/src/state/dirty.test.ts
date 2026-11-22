import { describe, expect, it } from "vitest";
import { PARAMS } from "../generated/params";
import { factory } from "../model/sound";
import { isDirty } from "./dirty";

const make = () => ({ state: { current: factory("A"), baseline: factory("A") } }) as Parameters<typeof isDirty>[0];

describe("isDirty", () => {
  it("is false when current equals the baseline", () => {
    expect(isDirty(make())).toBe(false);
  });
  it("is true after a value edit", () => {
    const s = make();
    const id = PARAMS[0]!.id;
    s.state.current.values[id] = s.state.current.values[id]! + 1;
    expect(isDirty(s)).toBe(true);
  });
  it("is true after a name edit", () => {
    const s = make();
    s.state.current.name = "B";
    expect(isDirty(s)).toBe(true);
  });
});

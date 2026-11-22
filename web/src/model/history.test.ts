import { describe, expect, it } from "vitest";
import { HISTORY_CAP, createHistory, mergeChanges } from "./history";
import { applyChanges, factory, type Change } from "./sound";

describe("history", () => {
  it("a drag of many moves is one undo step", () => {
    const moves: Change[][] = [];
    for (let v = 1; v <= 50; v++) moves.push([[7, v - 1, v]]);
    const merged = mergeChanges(moves);
    expect(merged).toEqual([[7, 0, 50]]);
    const h = createHistory();
    h.push(merged);
    expect(h.undo()).toEqual([[7, 50, 0]]);
    expect(h.canUndo()).toBe(false);
  });

  it("mergeChanges drops ids that return to the start and keeps several ids", () => {
    expect(mergeChanges([[[1, 5, 6], [2, 0, 9]], [[1, 6, 5]]])).toEqual([[2, 0, 9]]);
    expect(mergeChanges([])).toEqual([]);
  });

  it("the 201st step drops the oldest", () => {
    const h = createHistory();
    for (let i = 0; i < HISTORY_CAP + 1; i++) h.push([[i, 0, 1]]);
    let n = 0;
    let last: Change[] | null = null;
    for (let s = h.undo(); s; s = h.undo()) { n++; last = s; }
    expect(n).toBe(HISTORY_CAP);
    expect(last).toEqual([[1, 1, 0]]); // step with id 0 was dropped
  });

  it("undo then redo restores the sound exactly", () => {
    const s = factory();
    const h = createHistory();
    const orig = s.values.slice();
    const steps: Change[][] = [[[10, s.values[10], 3], [11, s.values[11], 4]], [[10, 3, 8]]];
    for (const st of steps) { applyChanges(s, st); h.push(st); }
    const after = s.values.slice();
    applyChanges(s, h.undo()!);
    applyChanges(s, h.undo()!);
    expect(s.values).toEqual(orig);
    applyChanges(s, h.redo()!);
    applyChanges(s, h.redo()!);
    expect(s.values).toEqual(after);
  });

  it("a new edit after undo clears redo", () => {
    const h = createHistory();
    h.push([[1, 0, 1]]);
    h.push([[1, 1, 2]]);
    h.undo();
    expect(h.canRedo()).toBe(true);
    h.push([[2, 0, 5]]);
    expect(h.canRedo()).toBe(false);
    expect(h.redo()).toBeNull();
  });

  it("undo and redo on empty history are no-ops", () => {
    const h = createHistory();
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
    h.push([]);
    expect(h.canUndo()).toBe(false);
  });

  it("stored steps are copies, and clear empties both stacks", () => {
    const h = createHistory();
    const c: Change[] = [[1, 0, 1]];
    h.push(c);
    c[0][2] = 99;
    expect(h.undo()).toEqual([[1, 1, 0]]);
    h.clear();
    expect(h.canRedo()).toBe(false);
  });
});

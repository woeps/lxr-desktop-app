import type { Change } from "./sound";

/** Steps kept before the oldest is dropped (R5.1 asks for at least 100). */
export const HISTORY_CAP = 200;

/**
 * Collapse a sequence of change sets (for example every move of one drag) into one:
 * per id the first "before" and the last "after". Ids that end where they began are
 * dropped. Order follows first appearance.
 */
export function mergeChanges(sets: readonly (readonly Change[])[]): Change[] {
  const byId = new Map<number, Change>();
  for (const set of sets) {
    for (const [id, before, after] of set) {
      const cur = byId.get(id);
      if (cur) cur[2] = after;
      else byId.set(id, [id, before, after]);
    }
  }
  return [...byId.values()].filter(([, b, a]) => b !== a);
}

export interface History {
  /** Record one step and clear redo. Empty change sets are ignored. */
  push(changes: readonly Change[]): void;
  /** Change set to apply to undo the last step (after = old value), or null when empty. */
  undo(): Change[] | null;
  /** Change set to apply to redo the last undone step, or null when there is none. */
  redo(): Change[] | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}

export function createHistory(cap = HISTORY_CAP): History {
  let undoStack: Change[][] = [];
  let redoStack: Change[][] = [];
  return {
    push(changes) {
      if (changes.length === 0) return;
      undoStack.push(changes.map(([i, b, a]) => [i, b, a]));
      if (undoStack.length > cap) undoStack.shift();
      redoStack = [];
    },
    undo() {
      const step = undoStack.pop();
      if (!step) return null;
      redoStack.push(step);
      return step.map(([i, b, a]) => [i, a, b]);
    },
    redo() {
      const step = redoStack.pop();
      if (!step) return null;
      undoStack.push(step);
      return step.map(([i, b, a]) => [i, b, a]);
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    clear() {
      undoStack = [];
      redoStack = [];
    },
  };
}

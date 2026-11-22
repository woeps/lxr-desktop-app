// Shared helpers of the parameter controls: read the value and lock of one parameter from the
// session, and write through `applyChanges` (design 4.5).
import type { ParamDef } from "../generated/params";
import type { Session } from "../state/session";

export const valueOf = (s: Session, def: ParamDef): number => s.state.current.values[def.id]!;
export const isLocked = (s: Session, def: ParamDef): boolean => s.state.locked.includes(def.id);

/** One undo step: set `def` to `to` unless locked. */
export function setValue(s: Session, def: ParamDef, to: number): void {
  if (isLocked(s, def)) return;
  s.applyChanges([[def.id, valueOf(s, def), to]]);
}

export const resetValue = (s: Session, def: ParamDef): void => setValue(s, def, def.def);

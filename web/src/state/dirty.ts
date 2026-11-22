import { diff } from "../model/sound";
import type { Session } from "./session";

/** Unsaved edits: the sound differs from the one last loaded or saved (R6.5). */
export function isDirty(session: Pick<Session, "state">): boolean {
  const { current, baseline } = session.state;
  return current.name !== baseline.name || diff(current, baseline).length > 0;
}

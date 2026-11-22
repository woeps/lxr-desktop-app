import { cleanName, nameError, type Library, type LibrarySound } from "./library";

export type SaveState =
  | { kind: "invalid"; reason: string }
  | { kind: "save" }
  | { kind: "update"; entry: LibrarySound }
  | { kind: "saved"; entry: LibrarySound };

/** What the Save button does for the typed name. `saved` needs the loaded entry and a clean sound. */
export function saveState(
  name: string,
  library: Pick<Library, "findByName">,
  loadedId: string | null,
  dirty: boolean,
): SaveState {
  const clean = cleanName(name);
  const reason = nameError(clean);
  if (reason) return { kind: "invalid", reason };
  const entry = library.findByName(clean);
  if (!entry) return { kind: "save" };
  return entry.id === loadedId && !dirty ? { kind: "saved", entry } : { kind: "update", entry };
}

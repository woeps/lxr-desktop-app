import { createSignal, onSettled } from "solid-js";
import { useApp } from "../state/app";
import { cleanName, nameError, type LibrarySound } from "../state/library";
import { useStatus } from "../state/status";
import styles from "./AppBar.module.css";

/**
 * Rename the loaded library entry and the current sound (R2.8, R2.9). Only names change: values,
 * the baseline values, the history and the module are left alone.
 */
export function RenameDialog(props: { entry: LibrarySound; onClose: () => void }) {
  const { session, library } = useApp();
  const status = useStatus();
  const [text, setText] = createSignal(props.entry.name);
  let input: HTMLInputElement | undefined;
  onSettled(() => { input?.focus(); input?.select(); });

  const clean = () => cleanName(text());
  const problem = (): string | null => {
    const c = clean();
    if (c === "") return "A name is required";
    const bad = nameError(c);
    if (bad) return bad;
    const other = library.findByName(c);
    return other && other.id !== props.entry.id ? `A sound named '${other.name}' already exists.` : null;
  };
  // A change of capitalisation alone is a change (R2.8).
  const unchanged = () => clean() === props.entry.name;
  const ok = () => problem() === null && !unchanged();

  function rename() {
    if (!ok()) return;
    const name = clean();
    const r = library.rename(props.entry.id, name);
    if (!r.ok) { status.say({ kind: "error", text: r.error }); return; }
    session.setName(name);
    session.renameBaseline(name);
    status.say({ kind: "success", text: `Renamed '${props.entry.name}' to '${name}'.` });
    props.onClose();
  }

  return (
    <div class={styles.rename} role="dialog" aria-label="Rename sound"
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); props.onClose(); } }}>
      <input
        ref={input}
        aria-label="New name"
        aria-invalid={problem() ? "true" : "false"}
        spellcheck={false}
        autocomplete="off"
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); rename(); } }}
      />
      {problem() ? <span role="alert" data-testid="rename-error">{problem()}</span> : null}
      <button type="button" disabled={!ok()} onClick={rename}>Rename</button>
      <button type="button" onClick={props.onClose}>Cancel</button>
    </div>
  );
}

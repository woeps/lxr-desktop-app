import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import { useApp } from "../state/app";
import { isDirty } from "../state/dirty";
import { cleanName, NAME_MAX, type LibrarySound } from "../state/library";
import { saveState } from "../state/saveState";
import { useStatus } from "../state/status";
import { shellIcon } from "../visual/shellIcons";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { SplitButton } from "./SplitButton";
import styles from "./AppBar.module.css";

/**
 * The sound name field with its Save split button (R2, design 3.4). The field keeps its own text;
 * only valid names reach the session, and the name edit is not an undo step.
 */
export function NameSave() {
  const app = useApp();
  const status = useStatus();
  const { session, library } = app;
  const [text, setText] = createSignal(untrack(() => session.state.current.name));
  const [focused, setFocused] = createSignal(false);
  const [replacing, setReplacing] = createSignal<LibrarySound | null>(null);
  const [renaming, setRenaming] = createSignal(false);

  // A load or a rename changes the name from outside: show it unless the field already says so.
  createEffect(() => session.state.current.name, (n) => { if (cleanName(untrack(text)) !== n) setText(n); });

  const clean = () => cleanName(text());
  const loaded = () => { const id = session.state.libraryId; return id ? library.get(id) : undefined; };
  const state = () => saveState(text(), library, loaded()?.id ?? null, isDirty(session));
  const canSave = () => { const k = state().kind; return k === "save" || k === "update"; };
  const label = () => { const k = state().kind; return k === "update" ? "Update" : k === "saved" ? "Saved" : "Save"; };
  const problem = () => {
    const s = state();
    return s.kind !== "invalid" ? null : clean() === "" ? "A name is required" : s.reason;
  };
  const hint = () => { const s = state(); return s.kind === "update" ? `'${s.entry.name}' exists. Save replaces it` : null; };

  const restore = () => setText(session.state.current.name);

  function onInput(raw: string) {
    setText(raw);
    const c = cleanName(raw);
    // Only a valid name reaches the session; an invalid one stays in the field with its message.
    if (c !== session.state.current.name && saveState(c, library, null, false).kind !== "invalid") session.setName(c);
  }

  function press() {
    const s = state();
    if (s.kind === "update") { setReplacing(s.entry); return; }
    if (s.kind !== "save") return;
    const name = clean();
    session.setName(name);
    const r = library.add(name, session.state.current);
    if (!r.ok) { status.say({ kind: "error", text: r.error }); return; }
    session.markSaved(r.value.id);
    status.say({ kind: "success", text: `Saved '${name}' to the library.` });
  }

  function replace(entry: LibrarySound) {
    const name = clean();
    setReplacing(null);
    session.setName(name);
    const r = library.replace(entry.id, name, session.state.current);
    if (!r.ok) { status.say({ kind: "error", text: r.error }); return; }
    session.markSaved(entry.id);
    status.say({ kind: "success", text: `Updated '${name}' in the library.` });
  }

  // R2.10: Ctrl+S (Cmd+S on macOS) saves and always blocks the browser's save dialog.
  const onDocKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (canSave()) press();
    }
  };
  document.addEventListener("keydown", onDocKey);
  onCleanup(() => document.removeEventListener("keydown", onDocKey));

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); if (canSave()) press(); }
    else if (e.key === "Escape") restore();
  };

  return (
    <span class={styles.name} role="group" aria-label="Sound name">
      <input
        class={styles.nameInput}
        aria-label="Sound name"
        aria-invalid={problem() ? "true" : "false"}
        aria-describedby="name-note"
        spellcheck={false}
        autocomplete="off"
        value={text()}
        onInput={(e) => onInput(e.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); if (clean() === "") restore(); }}
        onKeyDown={onKeyDown}
      />
      <Show when={focused()}><span class={styles.count} data-testid="name-count">{clean().length}/{NAME_MAX}</span></Show>
      <Show when={isDirty(session)}><span class={styles.dot} role="img" aria-label="Unsaved changes" title="Unsaved changes">●</span></Show>
      <SplitButton
        label={label()}
        icon={() => shellIcon("save")}
        accent="voice"
        mainDisabled={!canSave()}
        menuLabel="Save options"
        onPress={press}
        menu={
          <button type="button" role="menuitem" disabled={!loaded()} onClick={() => setRenaming(true)}>
            {loaded() ? `Rename '${loaded()!.name}'…` : "Rename…"}
          </button>
        }
      />
      <span id="name-note" class={styles.note}>
        <Show when={problem()}>{(p) => <span role="alert" data-testid="name-error">{p()}</span>}</Show>
        <Show when={!problem() && hint()}>{(h) => <span data-testid="name-hint">{h()}</span>}</Show>
      </span>
      <Show when={replacing()}>
        {(entry) => (
          <ConfirmDialog title="Replace library sound" confirmLabel="Replace" onConfirm={() => replace(entry())} onCancel={() => setReplacing(null)}>
            {`Replace the library sound '${entry().name}' with the current sound?`}
          </ConfirmDialog>
        )}
      </Show>
      <Show when={renaming() && loaded()}>
        {(entry) => <RenameDialog entry={entry()} onClose={() => setRenaming(false)} />}
      </Show>
    </span>
  );
}

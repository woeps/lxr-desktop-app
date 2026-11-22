import { createSignal, For, Show } from "solid-js";
import { readFile } from "../files/read";
import type { PackFile } from "../files/pack";
import { checkSndName } from "../files/snd";
import { useApp } from "../state/app";
import type { Importer } from "../state/importer";
import { nameError, NAME_MAX } from "../state/library";
import { ConfirmDialog } from "./ConfirmDialog";

const isSnd = (path: string) => path.toUpperCase().endsWith(".SND");

/**
 * The preset importer drawer (R1, R2, R3, R4, R5.2, R5.4): open a kit folder or files, step through
 * the presets and send each one live. Text only goes through text nodes.
 */
export function PresetImporter(props: { importer: Importer; onClose: () => void }) {
  const app = useApp();
  const imp = props.importer;
  const [message, setMessage] = createSignal<string | null>(null);
  const [replacing, setReplacing] = createSignal<PackFile[] | null>(null);
  const [replacingSounds, setReplacingSounds] = createSignal(false);
  const [selecting, setSelecting] = createSignal<string | null>(null);
  let list: HTMLUListElement | undefined;

  const canAdd = () => {
    const t = imp.state.presets.filter((p) => imp.state.ticked.includes(p.key));
    return t.length > 0 && t.every((p) => nameError(p.name) === null);
  };

  const existingTicked = () => imp.state.presets.filter((p) => imp.state.ticked.includes(p.key) && imp.exists(p.key)).length;
  const allTicked = () => imp.state.presets.length > 0 && imp.state.presets.every((p) => imp.state.ticked.includes(p.key));

  function choose(files: FileList | null) {
    const all: PackFile[] = Array.from(files ?? []).map((f) => ({
      path: f.webkitRelativePath || f.name,
      size: f.size,
      read: () => readFile(f),
    }));
    if (all.length === 0) return;
    if (all.length === 1) {
      const bad = checkSndName(all[0]!.path);
      if (bad) return setMessage(bad);
    }
    const kits = all.filter((f) => isSnd(f.path)).length;
    if (kits === 0) return setMessage(`No kit files (.SND) found. ${all.length} ${all.length === 1 ? "file" : "files"} ignored.`);
    setMessage(null);
    if (imp.state.presets.length > 0) setReplacing(all);
    else void imp.open(all);
  }

  function pick(key: string) {
    if (imp.select(key) === "confirm") setSelecting(key);
  }
  function stepFocus(delta: 1 | -1) {
    if (imp.step(delta) === "confirm") {
      const n = imp.state.presets.length;
      const i = imp.state.presets.findIndex((p) => p.key === imp.state.selected);
      const next = Math.min(n - 1, Math.max(0, (i < 0 ? (delta > 0 ? -1 : n) : i) + delta));
      setSelecting(imp.state.presets[next]!.key);
      return;
    }
    const i = imp.state.presets.findIndex((p) => p.key === imp.state.selected);
    list?.querySelectorAll<HTMLButtonElement>("button[data-select]")[i]?.focus();
  }
  function onRowKey(e: KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    stepFocus(e.key === "ArrowDown" ? 1 : -1);
  }
  const selectingName = () => imp.state.presets.find((p) => p.key === selecting())?.name ?? "";

  return (
    <aside aria-label="Preset importer"
      onKeyDown={(e) => { if (e.key === "Escape" && !replacing() && !selecting()) props.onClose(); }}>
      <h2>Preset importer</h2>
      <div>
        <label>Open folder…{" "}
          <input type="file" aria-label="Open folder" webkitdirectory
            onChange={(e) => { choose(e.currentTarget.files); e.currentTarget.value = ""; }} />
        </label>{" "}
        <label>Open files…{" "}
          <input type="file" multiple accept=".snd,.SND" aria-label="Open files"
            onChange={(e) => { choose(e.currentTarget.files); e.currentTarget.value = ""; }} />
        </label>
      </div>
      <Show when={message()}>{(m) => <p role="alert">{m()}</p>}</Show>
      <Show when={imp.state.presets.length > 0 || imp.state.unreadable.length > 0}>
        <p data-testid="importer-summary">
          {`${imp.state.presets.length} ${imp.state.presets.length === 1 ? "preset" : "presets"}, ${imp.state.ignored} ${imp.state.ignored === 1 ? "file" : "files"} ignored`}
          <Show when={imp.state.unreadable.length > 0}>{`, ${imp.state.unreadable.length} unreadable`}</Show>
        </p>
        <Show when={imp.state.unreadable.length > 0}>
          <ul data-testid="importer-unreadable">
            <For each={imp.state.unreadable}>{(u) => <li>{`${u.file}: ${u.reason}`}</li>}</For>
          </ul>
        </Show>
      </Show>
      <div>
        <button type="button" onClick={() => stepFocus(-1)}>Previous</button>
        <button type="button" onClick={() => stepFocus(1)}>Next</button>
        <button type="button" disabled={!app.hasOutput() || imp.state.selected === null}
          title={app.hasOutput() ? undefined : "Connect a MIDI output first"} onClick={() => imp.sendAgain()}>Send again</button>
      </div>
      <p role="status" data-testid="importer-hint">{imp.state.hint ?? ""}</p>
      <button type="button" disabled={imp.state.presets.length === 0} onClick={() => imp.toggleAll()}>
        {allTicked() ? "Deselect all" : "Select all"}
      </button>
      <ul ref={list}>
        <For each={imp.state.presets}>
          {(p) => (
            <li data-preset={p.file}>
              <input type="checkbox" aria-label={`Add ${p.file}`} checked={imp.state.ticked.includes(p.key)}
                onChange={(e) => imp.tick(p.key, e.currentTarget.checked)} />{" "}
              <button type="button" data-select aria-pressed={imp.state.selected === p.key ? "true" : "false"}
                onClick={() => pick(p.key)} onKeyDown={onRowKey}>
                {`${p.file} ${p.sound.name}`}
              </button>{" "}
              <input aria-label={`Name of ${p.file}`} maxlength={NAME_MAX * 4} value={p.name}
                onInput={(e) => imp.rename(p.key, e.currentTarget.value)} />
              <Show when={nameError(p.name)}>{(m) => <span role="alert">{m()}</span>}</Show>
              <Show when={imp.exists(p.key)}><span data-testid="importer-exists">exists, will be replaced</span></Show>
              <For each={p.notes}>{(n) => <div data-testid="importer-note">{n}</div>}</For>
            </li>
          )}
        </For>
      </ul>
      <button type="button" disabled={!canAdd()} onClick={() => { if (imp.addTicked() === "confirm") setReplacingSounds(true); }}>Add ticked to library</button>
      <Show when={imp.state.result}>{(m) => <p role="status" data-testid="importer-result">{m()}</p>}</Show>
      <button type="button" onClick={props.onClose}>Close</button>
      <Show when={replacing()}>
        {(files) => (
          <ConfirmDialog title="Replace list" confirmLabel="Replace list" onCancel={() => setReplacing(null)}
            onConfirm={() => { const f = files(); setReplacing(null); void imp.open(f); }}>
            {`Replace the list of ${imp.state.presets.length} presets?`}
          </ConfirmDialog>
        )}
      </Show>
      <Show when={replacingSounds()}>
        <ConfirmDialog title="Replace sounds" confirmLabel="Replace sounds" onCancel={() => setReplacingSounds(false)}
          onConfirm={() => { setReplacingSounds(false); imp.addTicked(true); }}>
          {`${existingTicked()} ${existingTicked() === 1 ? "sound" : "sounds"} in the library will be replaced by the ticked presets.`}
        </ConfirmDialog>
      </Show>
      <Show when={selecting()}>
        {(key) => (
          <ConfirmDialog title="Unsaved edits" confirmLabel="Discard edits and select" onCancel={() => setSelecting(null)}
            onConfirm={() => { const k = key(); setSelecting(null); imp.select(k, true); }}>
            {`The current sound has edits that are not saved. Selecting "${selectingName()}" replaces them. Undo brings them back.`}
          </ConfirmDialog>
        )}
      </Show>
    </aside>
  );
}

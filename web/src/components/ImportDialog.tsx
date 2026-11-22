import { createSignal, createStore, flush, For, Show } from "solid-js";
import { checkJsonName, importJson } from "../files/json";
import { readFile } from "../files/read";
import { checkSndName, importSnd, sndNotes } from "../files/snd";
import type { Sound } from "../model/sound";
import { useApp } from "../state/app";
import { cleanName, nameError, NAME_MAX, numberDuplicates } from "../state/library";
import { ConfirmDialog } from "./ConfirmDialog";

interface Entry {
  key: number;
  file: string;
  name: string;
  tags: string[];
  sound: Sound;
  /** Differences found while reading (R8.4, R8.5). */
  notes: string[];
  checked: boolean;
}

/**
 * Open .json sound files and .SND kits (R8.3 to R8.6). The sounds are listed first; nothing is
 * added to the library until the user ticks sounds and confirms.
 */
export function ImportDialog(props: { onClose: () => void }) {
  const app = useApp();
  // A store keeps each row's object, so typing in a name does not rebuild the row and lose focus.
  const [box, setBox] = createStore<{ list: Entry[] }>({ list: [] });
  const entries = () => box.list;
  const setEntries = (list: Entry[]) => { setBox((s) => { s.list = list; }); flush(); };
  const [errors, setErrors] = createSignal<string[]>([]);
  const [replacing, setReplacing] = createSignal(false);
  const [result, setResult] = createSignal<string | null>(null);
  let seq = 0;

  const patch = (key: number, p: Partial<Entry>) => {
    setBox((s) => { const e = s.list.find((x) => x.key === key); if (e) Object.assign(e, p); });
    flush();
  };
  const exists = (e: Entry) => app.library.findByName(cleanName(e.name)) !== undefined;
  const chosen = () => entries().filter((e) => e.checked);
  const canAdd = () => chosen().length > 0 && chosen().every((e) => nameError(e.name) === null);

  async function open(files: FileList | null) {
    const added: Entry[] = [];
    const errs: string[] = [];
    for (const f of Array.from(files ?? [])) {
      const buf = await readFile(f);
      if (checkSndName(f.name) === null && !f.name.toLowerCase().endsWith(".json")) {
        const r = importSnd(f.name, new Uint8Array(buf));
        if (!r.ok) { errs.push(r.error); continue; }
        const v = r.value;
        added.push({ key: ++seq, file: f.name, name: v.sound.name, tags: [], sound: v.sound, notes: sndNotes(v), checked: true });
        continue;
      }
      const bad = checkJsonName(f.name);
      if (bad) { errs.push(bad); continue; }
      const r = importJson(new TextDecoder().decode(buf));
      if (!r.ok) { errs.push(`${f.name}: ${r.error}`); continue; }
      for (const s of r.value.sounds) {
        const notes: string[] = [];
        if (r.value.tableMismatch) notes.push("made with a different parameter table");
        if (s.unknown.length) notes.push(`unknown parameters ignored: ${s.unknown.join(", ")}`);
        if (s.missing.length) notes.push(`missing parameters taken from the defaults: ${s.missing.join(", ")}`);
        if (s.clamped) notes.push(`${s.clamped} values out of range were clamped`);
        added.push({ key: ++seq, file: f.name, name: s.name, tags: s.tags, sound: s.sound, notes, checked: true });
      }
    }
    // Same name twice in the list: number the later ones (R3.4). Sounds that exist start unticked.
    const names = numberDuplicates(added.map((e) => e.name), entries().map((e) => e.name));
    added.forEach((e, i) => { e.name = names[i]!; e.checked = !exists(e); });
    setErrors(errs);
    setResult(null);
    setEntries([...entries(), ...added]);
  }

  function add(force = false) {
    const todo = chosen();
    if (!force && todo.some(exists)) return setReplacing(true);
    let n = 0;
    for (const e of todo) {
      const old = app.library.findByName(cleanName(e.name));
      const r = old ? app.library.replace(old.id, e.name, e.sound) : app.library.add(e.name, e.sound, e.tags);
      if (!r.ok) { setResult(`${r.error} Added ${n} of ${todo.length}.`); const done = new Set(todo.slice(0, n).map((x) => x.key)); setEntries(entries().filter((x) => !done.has(x.key))); return; }
      n++;
    }
    setEntries([]);
    setResult(`Added ${n} ${n === 1 ? "sound" : "sounds"} to the library.`);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Import sounds" onKeyDown={(e) => { if (e.key === "Escape") props.onClose(); }}>
      <label>Sound files (.json or .SND){" "}
        <input type="file" multiple accept=".json,.snd,.SND" aria-label="Sound files"
          onChange={(e) => { void open(e.currentTarget.files); e.currentTarget.value = ""; }} />
      </label>
      <For each={errors()}>{(m) => <p role="alert">{m}</p>}</For>
      <ul>
        <For each={entries()}>
          {(e) => (
            <li>
              <label>
                <input type="checkbox" aria-label={`Add ${e.file}: ${e.name}`} checked={e.checked}
                  onChange={(ev) => patch(e.key, { checked: ev.currentTarget.checked })} />
              </label>{" "}
              <input aria-label={`Name of ${e.file} sound`} maxlength={NAME_MAX * 4} value={e.name}
                onInput={(ev) => patch(e.key, { name: ev.currentTarget.value })} />
              <Show when={nameError(e.name)}>{(m) => <span role="alert">{m()}</span>}</Show>
              <Show when={exists(e)}><span data-testid="import-exists">exists, will be replaced</span></Show>
              <For each={e.notes}>{(n) => <div data-testid="import-note">{n}</div>}</For>
            </li>
          )}
        </For>
      </ul>
      <Show when={result()}>{(m) => <p role="status" data-testid="import-result">{m()}</p>}</Show>
      <button type="button" disabled={!canAdd()} onClick={() => add()}>Add selected to library</button>
      <button type="button" onClick={props.onClose}>Close</button>
      <Show when={replacing()}>
        <ConfirmDialog title="Replace sounds" confirmLabel="Replace sounds" onCancel={() => setReplacing(false)}
          onConfirm={() => { setReplacing(false); add(true); }}>
          {`${chosen().filter(exists).length} existing sounds in the library will be replaced by the selected files.`}
        </ConfirmDialog>
      </Show>
    </div>
  );
}

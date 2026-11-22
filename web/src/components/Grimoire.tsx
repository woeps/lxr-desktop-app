import { createSignal, For, onSettled, Show } from "solid-js";
import { diff } from "../model/sound";
import { download } from "../files/download";
import { exportJson } from "../files/json";
import { useApp } from "../state/app";
import { nameError, NAME_MAX, toSound, type LibrarySound, type LibraryResult, type SortKey } from "../state/library";
import { ConfirmDialog } from "./ConfirmDialog";

const day = (iso: string) => iso.slice(0, 16).replace("T", " ");
const fileName = (name: string) => `${name.replace(/[^A-Za-z0-9_-]+/g, "_") || "sound"}.json`;

/**
 * The sound library as a drawer (R6, design 4.7): list, sort, filter, tags, Load, Send, Rename,
 * Duplicate, Delete, Export and the entry to Import.
 */
export function Grimoire(props: { onClose: () => void; onImport: () => void }) {
  const app = useApp();
  const { library, session } = app;
  const [sort, setSort] = createSignal<SortKey>("name");
  const [filter, setFilter] = createSignal("");
  const [renaming, setRenaming] = createSignal<string | null>(null);
  const [renameText, setRenameText] = createSignal("");
  const [tagText, setTagText] = createSignal<Record<string, string>>({});
  const [deleting, setDeleting] = createSignal<LibrarySound | null>(null);
  const [loading, setLoading] = createSignal<LibrarySound | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [persisted, setPersisted] = createSignal<boolean | null>(null);

  onSettled(() => { void library.requestPersistence().then(setPersisted); });

  /** Unsaved edits: the sound differs from the one last loaded or saved (R6.5). */
  const dirty = () => session.state.current.name !== session.state.baseline.name
    || diff(session.state.current, session.state.baseline).length > 0;
  const rows = () => library.list({ sort: sort(), filter: filter() });
  const report = (r: LibraryResult<unknown>) => setError(r.ok ? null : r.error);

  function load(e: LibrarySound) {
    setLoading(null);
    session.load(toSound(e), e.id);
    setError(null);
  }
  function startRename(e: LibrarySound) { setRenaming(e.id); setRenameText(e.name); setError(null); }
  function saveRename(id: string) {
    const bad = nameError(renameText());
    if (bad) return setError(bad);
    const r = library.rename(id, renameText());
    report(r);
    if (r.ok) setRenaming(null);
  }
  function addTag(id: string) {
    const r = library.addTag(id, tagText()[id] ?? "");
    report(r);
    if (r.ok) setTagText({ ...tagText(), [id]: "" });
  }

  return (
    <aside aria-label="Grimoire" onKeyDown={(e) => { if (e.key === "Escape" && !deleting() && !loading()) props.onClose(); }}>
      <h2>Grimoire <small>sound library</small></h2>
      <p data-testid="storage-warning">
        The library lives in this browser's storage, which the browser can clear. Export the library
        to keep a backup.
        <Show when={persisted() !== null}>
          {" "}<span data-testid="persist-result">{persisted() ? "The browser agreed to keep this storage." : "The browser did not promise to keep this storage."}</span>
        </Show>
      </p>
      <div>
        <label>Filter{" "}
          <input aria-label="Filter by name or tag" value={filter()} onInput={(e) => setFilter(e.currentTarget.value)} />
        </label>{" "}
        <label>Sort{" "}
          <select aria-label="Sort by" onChange={(e) => setSort(e.currentTarget.value as SortKey)}>
            <option value="name">Name</option>
            <option value="created">Created</option>
            <option value="modified">Modified</option>
          </select>
        </label>
      </div>
      <Show when={error()}>{(m) => <p role="alert">{m()}</p>}</Show>
      <Show when={rows().length === 0}><p data-testid="library-empty">No sounds{filter().trim() ? " match" : " saved yet"}.</p></Show>
      <ul>
        <For each={rows()}>
          {(e) => (
            <li data-sound={e.name}>
              <Show when={renaming() === e.id} fallback={<strong>{e.name}</strong>}>
                <input aria-label={`New name for ${e.name}`} maxlength={NAME_MAX * 4} value={renameText()}
                  onInput={(ev) => setRenameText(ev.currentTarget.value)}
                  onKeyDown={(ev) => { if (ev.key === "Enter") saveRename(e.id); }} />
                <button type="button" onClick={() => saveRename(e.id)}>Save name</button>
                <button type="button" onClick={() => setRenaming(null)}>Cancel rename</button>
              </Show>
              <div>created {day(e.created)} · modified {day(e.modified)}</div>
              <div>
                <For each={e.tags}>
                  {(t) => <span>{t} <button type="button" aria-label={`Remove tag ${t} from ${e.name}`} onClick={() => report(library.removeTag(e.id, t))}>×</button> </span>}
                </For>
                <input aria-label={`New tag for ${e.name}`} value={tagText()[e.id] ?? ""}
                  onInput={(ev) => setTagText({ ...tagText(), [e.id]: ev.currentTarget.value })}
                  onKeyDown={(ev) => { if (ev.key === "Enter") addTag(e.id); }} />
                <button type="button" onClick={() => addTag(e.id)}>{`Add tag to ${e.name}`}</button>
              </div>
              <div>
                <button type="button" onClick={() => (dirty() ? setLoading(e) : load(e))}>{`Load ${e.name}`}</button>
                <button type="button" disabled={!app.hasOutput() || app.busy()} onClick={() => app.sendSound(toSound(e).values)}>{`Send ${e.name} to module`}</button>
                <button type="button" onClick={() => startRename(e)}>{`Rename ${e.name}`}</button>
                <button type="button" onClick={() => report(library.duplicate(e.id))}>{`Duplicate ${e.name}`}</button>
                <button type="button" onClick={() => setDeleting(e)}>{`Delete ${e.name}`}</button>
                <button type="button" onClick={() => download(fileName(e.name), exportJson([e]), "application/json")}>{`Export ${e.name}`}</button>
              </div>
            </li>
          )}
        </For>
      </ul>
      <button type="button" disabled={library.sounds.length === 0}
        onClick={() => download("lxr-library.json", exportJson(library.sounds), "application/json")}>Export library</button>
      <button type="button" onClick={props.onImport}>Import…</button>
      <button type="button" onClick={props.onClose}>Close Grimoire</button>
      <Show when={deleting()}>
        {(e) => (
          <ConfirmDialog title="Delete sound" confirmLabel="Delete" onCancel={() => setDeleting(null)}
            onConfirm={() => { const id = e().id; setDeleting(null); report(library.remove(id)); }}>
            {`Delete "${e().name}" from the library? This cannot be undone.`}
          </ConfirmDialog>
        )}
      </Show>
      <Show when={loading()}>
        {(e) => (
          <ConfirmDialog title="Unsaved edits" confirmLabel="Discard edits and load" onCancel={() => setLoading(null)}
            onConfirm={() => load(e())}>
            {`The current sound has edits that are not saved. Loading "${e().name}" discards them.`}
          </ConfirmDialog>
        )}
      </Show>
    </aside>
  );
}

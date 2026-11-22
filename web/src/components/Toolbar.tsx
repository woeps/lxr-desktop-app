import { createSignal, Show } from "solid-js";
import { useApp } from "../state/app";
import { nameError } from "../state/library";
import { copyVoice, diff, factory, pasteVoice } from "../model/sound";
import { rollAll, rollVoice } from "../state/roll";
import { NOTICE_NOT_SEEN } from "./notices";
import { PAGES, voiceOf } from "./voices";
import styles from "./Shell.module.css";

/**
 * Edit actions of the page (design 4.9). `onSeal` opens the store dialog.
 */
export function Toolbar(props: { onSeal: () => void; onGrimoire: () => void; onImporter: () => void; onSetup: () => void }) {
  const app = useApp();
  const { session } = app;
  // History is not a signal; every history change also replaces `current`, so reading it tracks that.
  const canUndo = () => (session.state.current, session.history.canUndo());
  const canRedo = () => (session.state.current, session.history.canRedo());
  const [amount, setAmount] = createSignal(50);
  const [saving, setSaving] = createSignal(false);
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const isDrum = () => typeof session.state.page === "number" && session.state.page <= 2;
  const voice = () => voiceOf(session.state.page);

  function initialise() {
    const f = factory();
    session.applyChanges(diff(session.state.current, f).map((id) => [id, session.state.current.values[id]!, f.values[id]!]));
  }
  const voiceName = () => PAGES.find((p) => p.page === session.state.page)?.name ?? "voice";
  function paste() {
    const clip = session.state.copyBuffer;
    if (clip) session.applyChanges(pasteVoice(session.state.current, voice(), clip, new Set(session.state.locked)));
  }
  function save() {
    const err = nameError(name());
    if (err) return setError(err);
    const r = app.library.add(name(), session.state.current);
    if (!r.ok) return setError(r.error);
    session.markSaved(r.value.id);
    setSaving(false);
    setError(null);
  }

  return (
    <div class={styles.bar} role="toolbar" aria-label="Sound actions">
      <button type="button" disabled={!canUndo()} onClick={() => session.undo()}>Undo</button>
      <button type="button" disabled={!canRedo()} onClick={() => session.redo()}>Redo</button>
      <button type="button" aria-pressed={session.state.abSnapshot ? "true" : "false"}
        title="Swap the current sound with the held snapshot" onClick={() => session.toggleAB()}>A/B</button>
      <button type="button" onClick={() => session.revert()}>Revert</button>
      <button type="button" onClick={initialise}>Initialise</button>
      <button type="button" disabled={!app.hasOutput()} title={NOTICE_NOT_SEEN} onClick={() => app.sendAll()}>Send all</button>
      <button type="button" disabled={app.pending()} title="Store the live sound into the module's boot slot" onClick={props.onSeal}>
        Seal into boot slot
      </button>
      <button type="button" aria-expanded={saving() ? "true" : "false"} onClick={() => { setName(session.state.current.name.slice(0, 8)); setSaving(!saving()); setError(null); }}>
        Save to library
      </button>
      <Show when={saving()}>
        <span role="group" aria-label="Save to library">
          <input aria-label="Sound name" maxlength={8} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
          <button type="button" onClick={save}>Save</button>
          <Show when={error()}><span role="alert">{error()}</span></Show>
        </span>
      </Show>
      <button type="button" onClick={props.onGrimoire}>Grimoire</button>
      <button type="button" onClick={props.onImporter}>Preset importer</button>
      <button type="button" onClick={props.onSetup}>MIDI setup</button>
      <span>Roll amount</span>
      <input type="range" min={0} max={100} value={amount()} aria-label="Roll amount"
        onInput={(e) => setAmount(Number(e.currentTarget.value))} />
      <output aria-label="Roll amount value">{amount()}%</output>
      <button type="button" onClick={() => rollAll(app, amount())}>Roll</button>
      <button type="button" onClick={() => rollVoice(app, voice(), amount())}>{`Roll ${voiceName()}`}</button>
      <Show when={isDrum()}>
        <button type="button" onClick={() => session.setCopyBuffer(copyVoice(session.state.current, voice()))}>Copy</button>
        <button type="button" disabled={!session.state.copyBuffer} onClick={paste}>Paste</button>
      </Show>
      <span class={styles.grow} data-testid="notice-not-seen">{NOTICE_NOT_SEEN}</span>
    </div>
  );
}

import { Show } from "solid-js";
import { useApp } from "../state/app";
import { useShell, type PanelId } from "../state/shell";
import { copyVoice, diff, factory, pasteVoice } from "../model/sound";
import { headerGlyph, type HeaderGlyph } from "../visual/glyphs";
import { shellIcon } from "../visual/shellIcons";
import { NameSave } from "./NameSave";
import { SplitButton } from "./SplitButton";
import { voiceOf } from "./voices";
import styles from "./AppBar.module.css";
import controls from "./Controls.module.css";

const PANEL_ICONS: { id: PanelId; glyph: HeaderGlyph; label: string }[] = [
  { id: "library", glyph: "library", label: "Library" },
  { id: "import", glyph: "import", label: "Import presets" },
  { id: "settings", glyph: "settings", label: "Settings" },
  { id: "info", glyph: "info", label: "Info" },
];

function Btn(props: { label: string; icon?: () => SVGElement; disabled?: boolean; pressed?: boolean; title?: string; onClick: () => void }) {
  return (
    <button type="button" class={controls.btn} disabled={props.disabled} title={props.title}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed ? "true" : "false"} onClick={() => props.onClick()}>
      {props.icon ? <span class={controls.icon} aria-hidden="true">{props.icon()}</span> : null}
      {props.label}
    </button>
  );
}

/**
 * The one-line action bar (R1, design 4.2): name and Save, history, Revert, Copy and Paste, Send,
 * and on the right the four panel icons. `onSeal` opens the store dialog.
 */
export function AppBar(props: { onSeal: () => void }) {
  const app = useApp();
  const shell = useShell();
  const { session } = app;
  // History is not a signal; every history change also replaces `current`, so reading it tracks that.
  const canUndo = () => (session.state.current, session.history.canUndo());
  const canRedo = () => (session.state.current, session.history.canRedo());
  const isDrum = () => typeof session.state.page === "number" && session.state.page <= 2;
  const voice = () => voiceOf(session.state.page);

  /** Factory sound as one undo step, no confirmation (R1.3). */
  function initialise() {
    const f = factory();
    session.applyChanges(diff(session.state.current, f).map((id) => [id, session.state.current.values[id]!, f.values[id]!]));
  }
  function paste() {
    const clip = session.state.copyBuffer;
    if (clip) session.applyChanges(pasteVoice(session.state.current, voice(), clip, new Set(session.state.locked)));
  }
  return (
    <div class={styles.bar} role="toolbar" aria-label="Sound actions">
      <NameSave />
      <Btn label="Undo" disabled={!canUndo()} onClick={() => session.undo()} />
      <Btn label="Redo" disabled={!canRedo()} onClick={() => session.redo()} />
      <Btn label="A/B" pressed={!!session.state.abSnapshot} title="Swap the current sound with the held snapshot" onClick={() => session.toggleAB()} />
      <SplitButton
        label="Revert"
        icon={() => shellIcon("revert")}
        menuLabel="Revert options"
        onPress={() => session.revert()}
        menu={<button type="button" role="menuitem" onClick={initialise}>Initialise</button>}
      />
      <Show when={isDrum()}>
        <Btn label="Copy" icon={() => shellIcon("copy")} onClick={() => session.setCopyBuffer(copyVoice(session.state.current, voice()))} />
        <Btn label="Paste" icon={() => shellIcon("paste")} disabled={!session.state.copyBuffer} onClick={paste} />
      </Show>
      <SplitButton
        label="Send all"
        icon={() => shellIcon("send")}
        accent="gold"
        mainDisabled={!app.hasOutput()}
        menuLabel="Send options"
        onPress={() => app.sendAll()}
        menu={
          <>
            <button type="button" role="menuitem" disabled={app.pending()} title="Store the live sound into the module's boot slot" onClick={props.onSeal}>
              Seal into boot slot
            </button>
            <button type="button" role="menuitem" onClick={() => app.settings.set({ auditionAfterSend: !app.settings.state.auditionAfterSend })}>
              Audition after send{app.settings.state.auditionAfterSend ? " ✓" : ""}
            </button>
          </>
        }
      />
      <span class={styles.grow} />
      {PANEL_ICONS.map((p) => (
        <button type="button" class={controls.btn} aria-label={p.label} title={p.label}
          aria-pressed={shell.panel() === p.id ? "true" : "false"}
          onClick={(e) => { shell.setLastIcon(e.currentTarget); shell.toggle(p.id); }}>
          <span class={controls.icon} aria-hidden="true">{headerGlyph(p.glyph)}</span>
        </button>
      ))}
    </div>
  );
}

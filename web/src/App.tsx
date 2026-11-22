import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { AppBar } from "./components/AppBar";
import { Dock } from "./components/Dock";
import { ImportDialog } from "./components/ImportDialog";
import { ImportPanel } from "./components/ImportPanel";
import { InfoPanel } from "./components/InfoPanel";
import { LibraryPanel } from "./components/LibraryPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatusStrip } from "./components/StatusStrip";
import { StoreDialog } from "./components/StoreDialog";
import { ShieldRow } from "./components/ShieldRow";
import { VoicePage } from "./components/VoicePage";
import { AppContext, createApp, type App as AppState } from "./state/app";
import { createImporter } from "./state/importer";
import { SessionContext } from "./state/session";
import { createShell, guardOutput, ShellContext } from "./state/shell";
import { createStatus, StatusContext } from "./state/status";

/** Page shell (design 4.9). `app` is injectable for tests. */
export function App(props: { app?: AppState }) {
  const app = props.app ?? createApp();

  const shell = createShell();
  const strikeKey = guardOutput(app, shell, (i: number) => { if (i === 7) app.playAll(); else app.strike(i); });

  // R4.3: mapped keys trigger voices; ignored in text fields, with modifiers and on key repeat.
  function onKey(e: KeyboardEvent) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) || t.isContentEditable)) return;
    const i = app.settings.state.keys.indexOf(e.key);
    if (i < 0) return;
    strikeKey(i);
  }
  document.addEventListener("keydown", onKey);
  onCleanup(() => document.removeEventListener("keydown", onKey));
  const onPageHide = () => app.session.flushSave();
  window.addEventListener("pagehide", onPageHide);
  onCleanup(() => window.removeEventListener("pagehide", onPageHide));

  const [sealing, setSealing] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const status = createStatus();
  // R7.4: connection errors (output gone, access denied) show in the strip.
  let mirrored: string | null = null;
  createEffect(() => (app.rev(), app.conn.message()), (m) => {
    if (m) {
      mirrored = m;
      status.say({ kind: "error", text: m, action: { label: "Open connection", run: () => shell.openConnection() } });
    } else if (mirrored !== null) {
      if (status.current()?.text === mirrored) status.dismiss();
      mirrored = null;
    }
  });
  // Created once so the list and selection survive closing and reopening the panel.
  const importer = createImporter(app);

  return (
    <AppContext value={app}>
      <SessionContext value={app.session}>
       <ShellContext value={shell}>
        <StatusContext value={status}>
        <AppBar onSeal={guardOutput(app, shell, () => setSealing(true))} />
        <Show when={sealing()}><StoreDialog onClose={() => setSealing(false)} /></Show>
        <Show when={shell.panel() === "library"}><LibraryPanel onImport={() => setImporting(true)} /></Show>
        <Show when={shell.panel() === "import"}><ImportPanel importer={importer} /></Show>
        <Show when={importing()}><ImportDialog onClose={() => setImporting(false)} /></Show>
        <Show when={shell.panel() === "settings"}><SettingsPanel onClose={() => shell.close()} /></Show>
        <Show when={shell.panel() === "info"}><InfoPanel /></Show>
        <ShieldRow />
        <VoicePage />
        <Dock />
        <StatusStrip />
        </StatusContext>
       </ShellContext>
      </SessionContext>
    </AppContext>
  );
}

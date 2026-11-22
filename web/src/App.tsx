import { createSignal, onCleanup, Show } from "solid-js";
import { AppBar } from "./components/AppBar";
import { AuditionBar } from "./components/AuditionBar";
import { ConnectBar } from "./components/ConnectBar";
import { Footer } from "./components/Footer";
import { Grimoire } from "./components/Grimoire";
import { ImportDialog } from "./components/ImportDialog";
import { MidiSetupDialog } from "./components/MidiSetupDialog";
import { PresetImporter } from "./components/PresetImporter";
import { StoreDialog } from "./components/StoreDialog";
import { TransferStatus } from "./components/TransferStatus";
import { ShieldRow } from "./components/ShieldRow";
import { VoicePage } from "./components/VoicePage";
import { AppContext, createApp, type App as AppState } from "./state/app";
import { createImporter } from "./state/importer";
import { SessionContext } from "./state/session";
import { createShell, ShellContext } from "./state/shell";
import { createStatus, StatusContext } from "./state/status";

/** Page shell (design 4.9). `app` is injectable for tests. */
export function App(props: { app?: AppState }) {
  const app = props.app ?? createApp();

  // R4.3: mapped keys trigger voices; ignored in text fields, with modifiers and on key repeat.
  function onKey(e: KeyboardEvent) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) || t.isContentEditable)) return;
    const i = app.settings.state.keys.indexOf(e.key);
    if (i < 0) return;
    if (i === 7) app.playAll(); else app.strike(i);
  }
  document.addEventListener("keydown", onKey);
  onCleanup(() => document.removeEventListener("keydown", onKey));
  const onPageHide = () => app.session.flushSave();
  window.addEventListener("pagehide", onPageHide);
  onCleanup(() => window.removeEventListener("pagehide", onPageHide));

  const [sealing, setSealing] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const shell = createShell();
  const status = createStatus();
  // Created once so the list and selection survive closing and reopening the drawer.
  const importer = createImporter(app);

  return (
    <AppContext value={app}>
      <SessionContext value={app.session}>
       <ShellContext value={shell}>
        <StatusContext value={status}>
        <ConnectBar />
        <AppBar onSeal={() => setSealing(true)} />
        <Show when={sealing()}><StoreDialog onClose={() => setSealing(false)} /></Show>
        <Show when={shell.panel() === "library"}><Grimoire onClose={() => shell.close()} onImport={() => setImporting(true)} /></Show>
        <Show when={shell.panel() === "import"}><PresetImporter importer={importer} onClose={() => shell.close()} /></Show>
        <Show when={importing()}><ImportDialog onClose={() => setImporting(false)} /></Show>
        <Show when={shell.panel() === "settings"}><MidiSetupDialog onClose={() => shell.close()} /></Show>
        <TransferStatus />
        <ShieldRow />
        <VoicePage />
        <AuditionBar />
        <Footer />
        </StatusContext>
       </ShellContext>
      </SessionContext>
    </AppContext>
  );
}

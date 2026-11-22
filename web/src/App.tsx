import { createSignal, onCleanup, Show } from "solid-js";
import { AuditionBar } from "./components/AuditionBar";
import { ConnectBar } from "./components/ConnectBar";
import { Footer } from "./components/Footer";
import { Grimoire } from "./components/Grimoire";
import { ImportDialog } from "./components/ImportDialog";
import { MidiSetupDialog } from "./components/MidiSetupDialog";
import { StoreDialog } from "./components/StoreDialog";
import { Toolbar } from "./components/Toolbar";
import { TransferStatus } from "./components/TransferStatus";
import { VoicePage } from "./components/VoicePage";
import { VoiceShields } from "./components/VoiceShields";
import { AppContext, createApp, type App as AppState } from "./state/app";
import { SessionContext } from "./state/session";

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
  const [grimoire, setGrimoire] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [setup, setSetup] = createSignal(false);

  return (
    <AppContext value={app}>
      <SessionContext value={app.session}>
        <ConnectBar />
        <Toolbar onSeal={() => setSealing(true)} onGrimoire={() => setGrimoire(!grimoire())} onSetup={() => setSetup(true)} />
        <Show when={sealing()}><StoreDialog onClose={() => setSealing(false)} /></Show>
        <Show when={grimoire()}><Grimoire onClose={() => setGrimoire(false)} onImport={() => setImporting(true)} /></Show>
        <Show when={importing()}><ImportDialog onClose={() => setImporting(false)} /></Show>
        <Show when={setup()}><MidiSetupDialog onClose={() => setSetup(false)} /></Show>
        <TransferStatus />
        <VoiceShields />
        <VoicePage />
        <AuditionBar />
        <Footer />
      </SessionContext>
    </AppContext>
  );
}

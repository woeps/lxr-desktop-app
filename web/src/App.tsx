import { onCleanup } from "solid-js";
import { AuditionBar } from "./components/AuditionBar";
import { ConnectBar } from "./components/ConnectBar";
import { Footer } from "./components/Footer";
import { Toolbar } from "./components/Toolbar";
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

  return (
    <AppContext value={app}>
      <SessionContext value={app.session}>
        <ConnectBar />
        <Toolbar onSeal={() => { /* StoreDialog arrives with task 11.2 */ }} />
        <VoiceShields />
        <VoicePage />
        <AuditionBar />
        <Footer />
      </SessionContext>
    </AppContext>
  );
}

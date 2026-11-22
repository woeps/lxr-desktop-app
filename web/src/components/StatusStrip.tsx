import { createSignal, Show } from "solid-js";
import { useApp } from "../state/app";
import { useStatus } from "../state/status";
import styles from "./Shell.module.css";

/**
 * The status strip (R7, design 3.6), last row of the page. Shows, in this priority: a running
 * transfer, the mixed-sound note after a cancel, a posted message, the end of a transfer. Hidden
 * when there is nothing to show.
 */
export function StatusStrip() {
  const app = useApp();
  const status = useStatus();
  const t = () => app.progress();
  const running = () => app.busy() && !app.cancelled();
  const stopped = () => app.cancelled() && !running();
  // The finished transfer whose note was dismissed; a new transfer has a new progress object.
  const [dismissed, setDismissed] = createSignal<unknown>(null);
  const finished = () => {
    const tr = t();
    return tr !== null && !running() && !stopped() && tr.sent === tr.total && tr !== dismissed();
  };
  // A message without text never makes a band.
  const posted = () => { const c = status.current(); return running() || stopped() || !c || c.text.trim() === "" ? null : c; };
  const shown = () => running() || stopped() || posted() !== null || finished();
  const dismiss = () => { status.dismiss(); setDismissed(t()); };

  return (
    <Show when={shown()}>
      <div
        class={styles.strip}
        data-status-strip
        data-kind={running() || stopped() ? "info" : posted()?.kind === "error" ? "error" : posted()?.kind === "success" ? "success" : "info"}
        onPointerEnter={() => status.pause()}
        onPointerLeave={() => status.resume()}
        onFocusIn={() => status.pause()}
        onFocusOut={() => status.resume()}
      >
        <Show when={running() && t()}>
          {(tr) => (
            <span role="status">
              <progress max={tr().total} value={tr().sent} aria-label="Transfer progress" />
              <span data-testid="transfer-count">{tr().sent} / {tr().total}</span>
              <button type="button" onClick={() => app.cancelTransfer()}>Cancel</button>
            </span>
          )}
        </Show>
        <Show when={stopped() && t()}>
          {(tr) => (
            <span role="status">
              <span data-testid="transfer-count">{tr().sent} / {tr().total}</span>
              <span data-testid="transfer-note">Module holds a mix of the old and new sound.</span>
              <button type="button" disabled={!app.hasOutput()} onClick={() => app.sendAll()}>Send again</button>
            </span>
          )}
        </Show>
        <Show when={posted()}>
          {(s) => (
            <span role={s().kind === "error" ? "alert" : "status"} data-testid="status-message">
              {s().text}
              <Show when={s().action}>
                {(a) => <button type="button" onClick={() => a().run()}>{a().label}</button>}
              </Show>
            </span>
          )}
        </Show>
        <Show when={finished() && t()}>
          {(tr) => (
            <span role="status">
              <span data-testid="transfer-count">{tr().sent} / {tr().total}</span>
              <span data-testid="transfer-note">
                All messages were handed to the MIDI output. Arrival at the module cannot be confirmed.
              </span>
            </span>
          )}
        </Show>
        <Show when={!running()}>
          <button type="button" aria-label="Dismiss" onClick={dismiss}>×</button>
        </Show>
      </div>
    </Show>
  );
}

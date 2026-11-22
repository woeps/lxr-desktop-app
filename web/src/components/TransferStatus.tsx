import { Show } from "solid-js";
import { useApp } from "../state/app";
import styles from "./Shell.module.css";

/**
 * Progress of the latest transfer (R6.2, R6.3, R6.7): messages handed to the output of the total,
 * Cancel while it runs, Send again after a cancel, and the Audition after send option.
 */
export function TransferStatus() {
  const app = useApp();
  const t = () => app.progress();
  const running = () => app.busy() && !app.cancelled();
  const stopped = () => app.cancelled() && !running();
  return (
    <div class={styles.bar} role="group" aria-label="Transfer">
      <Show when={t()}>
        {(tr) => (
          <>
            <progress max={tr().total} value={tr().sent} aria-label="Transfer progress" />
            <span data-testid="transfer-count">{tr().sent} / {tr().total}</span>
            <Show when={running()}>
              <button type="button" onClick={() => app.cancelTransfer()}>Cancel</button>
            </Show>
            <Show when={stopped()}>
              <span role="status" data-testid="transfer-note">Module holds a mix of the old and new sound.</span>
              <button type="button" disabled={!app.hasOutput()} onClick={() => app.sendAll()}>Send again</button>
            </Show>
            <Show when={!running() && !stopped() && tr().sent === tr().total}>
              <span role="status" data-testid="transfer-note">
                All messages were handed to the MIDI output. Arrival at the module cannot be confirmed.
              </span>
            </Show>
          </>
        )}
      </Show>
      <label>
        <input type="checkbox" checked={app.settings.state.auditionAfterSend}
          onChange={(e) => app.settings.set({ auditionAfterSend: e.currentTarget.checked })} />
        {" "}Audition after send
      </label>
    </div>
  );
}

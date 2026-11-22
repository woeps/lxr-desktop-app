import { createEffect, For, Show } from "solid-js";
import { useApp } from "../state/app";
import { NOTICE_NOT_SENT, NOTICE_ONE_WAY } from "./notices";
import styles from "./Shell.module.css";

/** Connect, output choice, status, Test and the one-way notice (R1). */
export function ConnectBar() {
  const app = useApp();
  const sel = () => { app.rev(); return app.conn.selected(); };
  const status = () => { app.rev(); return app.conn.message() ?? (sel() ? "Connected" : app.conn.status() === "ready" ? "No output" : "Not connected"); };
  let select!: HTMLSelectElement;
  // Options are rebuilt on every list change, so the shown choice is written after them.
  createEffect(() => sel()?.id ?? "", (id) => { select.value = id; });
  return (
    <div class={styles.bar} role="group" aria-label="MIDI connection">
      <button type="button" onClick={() => void app.conn.connect()}>Connect</button>
      <label>
        Output{" "}
        <select
          ref={select}
          aria-label="MIDI output"
          onChange={(e) => app.conn.select(e.currentTarget.value || null)}
        >
          <option value="">none</option>
          <For each={(app.rev(), app.conn.outputs())}>
            {(o) => <option value={o.id}>{o.name}</option>}
          </For>
        </select>
      </label>
      <span role="status" data-testid="connection-status">{status()}</span>
      <button type="button" disabled={!app.hasOutput()} onClick={() => app.conn.testNote()}>Test</button>
      <span class={styles.grow}>
        <span data-testid="notice-one-way">{NOTICE_ONE_WAY}</span>
        <Show when={!app.hasOutput()}>{" "}<strong data-testid="notice-not-sent">{NOTICE_NOT_SENT}</strong></Show>
      </span>
      <span data-testid="pending" aria-live="polite">
        {app.progress() && app.busy() ? `Sending ${app.progress()!.sent}/${app.progress()!.total}` : app.pending() ? "Sending…" : ""}
      </span>
    </div>
  );
}

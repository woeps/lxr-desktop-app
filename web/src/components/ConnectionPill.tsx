import { createEffect, For, Show } from "solid-js";
import { useApp } from "../state/app";
import { useShell } from "../state/shell";
import { NOTICE_NOT_SENT, NOTICE_ONE_WAY } from "./notices";
import { Popover } from "./Popover";
import styles from "./Dock.module.css";

/** Connect, output choice, status, Test and the one-way notice: the content of the popover (R6.3). */
function ConnectionForm() {
  const app = useApp();
  const sel = () => { app.rev(); return app.conn.selected(); };
  let select!: HTMLSelectElement;
  // Options are rebuilt on every list change, so the shown choice is written after them.
  createEffect(() => sel()?.id ?? "", (id) => { select.value = id; });
  return (
    <div class={styles.connection}>
      <button type="button" onClick={() => void app.conn.connect()}>Connect</button>
      <label>
        Output{" "}
        <select ref={select} aria-label="MIDI output" onChange={(e) => app.conn.select(e.currentTarget.value || null)}>
          <option value="">none</option>
          <For each={(app.rev(), app.conn.outputs())}>
            {(o) => <option value={o.id}>{o.name}</option>}
          </For>
        </select>
      </label>
      <span role="status" data-testid="connection-status">{(app.rev(), app.conn.message() ?? "")}</span>
      <button type="button" disabled={!app.hasOutput()} onClick={() => app.conn.testNote()}>Test</button>
      <span>
        <span data-testid="notice-one-way">{NOTICE_ONE_WAY}</span>
        <Show when={!app.hasOutput()}>{" "}<strong data-testid="notice-not-sent">{NOTICE_NOT_SENT}</strong></Show>
      </span>
    </div>
  );
}

/** Pill with a dot and the output name; opens the connection popover above it (R6.2, R6.3). */
export function ConnectionPill() {
  const app = useApp();
  const shell = useShell();
  let pill: HTMLButtonElement | undefined;
  const sel = () => { app.rev(); return app.conn.selected(); };
  // The text carries the state, the dot is decoration (R6.2).
  const text = () => sel()?.name ?? (app.conn.status() === "ready" ? "No output" : "Not connected");
  return (
    <span class={styles.pillWrap}>
      <button
        type="button"
        ref={pill}
        class={styles.pill}
        data-connection-pill
        aria-haspopup="dialog"
        aria-expanded={shell.connectionOpen() ? "true" : "false"}
        onClick={() => (shell.connectionOpen() ? shell.closeConnection() : shell.openConnection())}
      >
        <span class={styles.dot} data-on={sel() ? "true" : "false"} aria-hidden="true" />
        {text()}
      </button>
      <Popover open={shell.connectionOpen()} onClose={() => shell.closeConnection()} anchor={() => pill}
        placement="top" role="dialog" label="MIDI connection">
        <ConnectionForm />
      </Popover>
    </span>
  );
}

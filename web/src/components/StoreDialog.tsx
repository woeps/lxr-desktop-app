import { createEffect, Show } from "solid-js";
import { useApp } from "../state/app";
import { useStatus } from "../state/status";
import { NOTICE_NO_FLASH } from "./notices";

const two = (n: number) => String(n).padStart(2, "0");
const timeOfDay = (ms: number) => {
  const d = new Date(ms);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
};

/**
 * Confirm dialog of "Seal into boot slot" (R7.8 to R7.11, design 4.9). Confirm is disabled while
 * messages are being sent and for 2 s after a store; the app sends the full sound first when the
 * module may differ.
 */
export function StoreDialog(props: { onClose: () => void }) {
  const app = useApp();
  const status = useStatus();
  // R7.4: the strip carries the progress and result of this flow too.
  createEffect(() => app.storeWaiting(), (w) => {
    if (w) status.say({ kind: "info", text: "Sending the sound; the store command follows." });
  });
  createEffect(() => (app.storeWaiting() ? null : app.storedAt()), (at) => {
    if (at !== null) status.say({ kind: "info", text: `Store command sent at ${timeOfDay(at)}. The module writes it over its boot slot; this cannot be confirmed over a one-way link.` });
  });
  return (
    <div role="dialog" aria-modal="true" aria-label="Seal into boot slot" onKeyDown={(e) => { if (e.key === "Escape") props.onClose(); }}>
      <p>
        The module's live sound, as this page last sent it, will be written over its boot slot. The
        slot keeps its existing name on the module. The link is one-way, so the page cannot confirm
        that the write happened.
      </p>
      <p>{NOTICE_NO_FLASH}</p>
      <Show when={!app.session.state.moduleInSync}>
        <p data-testid="store-full-first">The page will send the full sound first, then the store command.</p>
      </Show>
      <Show when={app.storeWaiting()}>
        <p role="status" data-testid="store-status">Sending the sound; the store command follows.</p>
      </Show>
      <Show when={!app.storeWaiting() && app.storedAt()}>
        {(at) => (
          <p role="status" data-testid="store-status">
            Store command sent at {timeOfDay(at())}. The module writes it over its boot slot; this
            cannot be confirmed over a one-way link.
          </p>
        )}
      </Show>
      <button type="button" disabled={app.storeBlocked()} onClick={() => app.store()}>Confirm store</button>
      <button type="button" onClick={props.onClose}>Close</button>
    </div>
  );
}

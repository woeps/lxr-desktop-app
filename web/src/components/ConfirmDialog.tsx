import type { JSX } from "@solidjs/web";

/** A modal yes/no question (R6.4 Delete, R6.5 unsaved edits). Escape cancels. */
export function ConfirmDialog(props: {
  title: string;
  children: JSX.Element;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alertdialog" aria-modal="true" aria-label={props.title} onKeyDown={(e) => { if (e.key === "Escape") props.onCancel(); }}>
      <p>{props.children}</p>
      <button type="button" onClick={props.onConfirm}>{props.confirmLabel}</button>
      <button type="button" onClick={props.onCancel}>Cancel</button>
    </div>
  );
}

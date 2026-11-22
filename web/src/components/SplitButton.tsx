import { createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Popover } from "./Popover";
import styles from "./Controls.module.css";

/** A main button joined to a caret button that opens a menu of `menuitem` buttons. */
export function SplitButton(props: {
  label: string;
  icon?: () => SVGElement;
  onPress: () => void;
  menu: JSX.Element;
  menuLabel?: string;
  disabled?: boolean;
  accent?: "voice" | "gold";
}) {
  const [open, setOpen] = createSignal(false);
  let caret: HTMLButtonElement | undefined;
  let wrap: HTMLSpanElement | undefined;
  const onCaretKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
  };
  return (
    <span class={styles.split} data-accent={props.accent} ref={wrap}>
      <button type="button" class={styles.btn} disabled={props.disabled} onClick={() => props.onPress()}>
        {props.icon ? <span class={styles.icon} aria-hidden="true">{props.icon()}</span> : null}
        {props.label}
      </button>
      <button
        type="button"
        ref={caret}
        class={`${styles.btn} ${styles.caret}`}
        aria-label={props.menuLabel ?? `${props.label} options`}
        aria-haspopup="menu"
        aria-expanded={open() ? "true" : "false"}
        disabled={props.disabled}
        onClick={() => setOpen(!open())}
        onKeyDown={onCaretKey}
      >
        <span aria-hidden="true">▾</span>
      </button>
      <Popover open={open()} onClose={() => setOpen(false)} anchor={() => caret} role="menu" label={props.menuLabel ?? `${props.label} options`}>
        {props.menu}
      </Popover>
    </span>
  );
}

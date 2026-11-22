import { createEffect, onCleanup, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import styles from "./Controls.module.css";

const ITEM = '[role="menuitem"]:not(:disabled)';

/**
 * Menu or dialog rendered in place (no portal), absolutely positioned under or over `anchor`.
 * Closes on Escape (focus returns to the anchor), on a pointerdown outside, and when focus leaves.
 * role "menu": menuitem buttons with roving tabindex, ArrowUp, ArrowDown, Home, End.
 * role "dialog": free content, no focus trap.
 */
export function Popover(props: {
  open: boolean;
  onClose: () => void;
  anchor: () => HTMLElement | undefined;
  placement?: "bottom" | "top";
  role: "menu" | "dialog";
  label: string;
  children: JSX.Element;
}) {
  let box: HTMLDivElement | undefined;
  const items = () => Array.from(box?.querySelectorAll<HTMLElement>(ITEM) ?? []);
  const focusItem = (i: number) => {
    const list = items();
    if (!list.length) return;
    const n = (i + list.length) % list.length;
    list.forEach((el, k) => { el.tabIndex = k === n ? 0 : -1; });
    list[n]!.focus();
  };
  const close = (refocus: boolean) => {
    props.onClose();
    if (refocus) props.anchor()?.focus();
  };

  // On open a menu focuses its first item.
  createEffect(() => props.open, (open) => { if (open && props.role === "menu") focusItem(0); });

  // Outside pointerdown closes; a press on the anchor is left to the anchor's own toggle.
  createEffect(() => props.open, (open) => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (box?.contains(t) || props.anchor()?.contains(t))) return;
      props.onClose();
    };
    document.addEventListener("pointerdown", down, true);
    onCleanup(() => document.removeEventListener("pointerdown", down, true));
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (props.role !== "menu") return;
    const at = items().indexOf(document.activeElement as HTMLElement);
    const move = e.key === "ArrowDown" ? at + 1 : e.key === "ArrowUp" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? -1 : null;
    if (move === null) return;
    e.preventDefault();
    focusItem(move);
  };
  const onFocusOut = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && !box?.contains(to) && !props.anchor()?.contains(to)) props.onClose();
  };
  const onClick = (e: MouseEvent) => {
    if (props.role === "menu" && (e.target as Element).closest(ITEM)) close(true);
  };

  return (
    <Show when={props.open}>
      <div
        ref={box}
        class={styles.popover}
        data-placement={props.placement ?? "bottom"}
        role={props.role}
        aria-label={props.label}
        onKeyDown={onKeyDown}
        onFocusOut={onFocusOut}
        onClick={onClick}
      >
        {props.children}
      </div>
    </Show>
  );
}

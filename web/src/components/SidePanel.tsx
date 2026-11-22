import { onCleanup, onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";
import { useShell } from "../state/shell";
import { headerGlyph, type HeaderGlyph } from "../visual/glyphs";
import styles from "./Panel.module.css";

const DIALOG = "[role=dialog], [role=alertdialog]";

/**
 * A side panel over the right edge (R5, design 4.3). Focus moves in on open (to `[data-autofocus]`
 * or the X button) and back to the icon on close. Escape and a press outside close it, unless a
 * dialog is open: the dialog gets them first.
 */
export function SidePanel(props: { title: string; glyph: HeaderGlyph; children: JSX.Element }) {
  const shell = useShell();
  let box: HTMLElement | undefined;
  let x: HTMLButtonElement | undefined;

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if ((e.target as Element | null)?.closest?.(DIALOG) || document.querySelector(DIALOG)) return;
    shell.close();
  };
  const onDown = (e: PointerEvent) => {
    const t = e.target as Element | null;
    if (!t || box?.contains(t) || shell.lastIcon()?.contains(t) || t.closest?.(DIALOG)) return;
    shell.close();
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onDown);
  onCleanup(() => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("pointerdown", onDown);
    // Switching panels keeps `panel()` set: the next panel takes the focus then.
    if (shell.panel() === null) shell.lastIcon()?.focus();
  });
  onSettled(() => { (box?.querySelector<HTMLElement>("[data-autofocus]") ?? x)?.focus(); });

  return (
    <aside ref={box} class={styles.panel} role="complementary" aria-label={props.title}>
      <header class={styles.header}>
        <span class={styles.glyph} aria-hidden="true">{headerGlyph(props.glyph)}</span>
        <h2 class={styles.title}>{props.title}</h2>
        <button ref={x} type="button" class={styles.x} aria-label={`Close ${props.title}`} title="Close" onClick={() => shell.close()}>✕</button>
      </header>
      <div class={styles.body}>{props.children}</div>
    </aside>
  );
}

import { createEffect } from "solid-js";
import styles from "./Shell.module.css";

/**
 * Strike pad of one voice slot (design 4.9). A pointer click sets the velocity from the click height
 * (top = 127, bottom = 1); a keyboard click (detail 0) or a box without layout uses the audition velocity.
 */
export function RuneStone(props: {
  name: string; keyHint: string; color: string; disabled?: boolean;
  onStrike: (velocity?: number) => void;
}) {
  let el!: HTMLButtonElement;
  createEffect(() => props.color, (c) => el.style.setProperty("--stone", c));
  return (
    <button
      type="button"
      class={styles.stone}
      aria-label={`Trigger ${props.name}`}
      title={`${props.name} (key ${props.keyHint})`}
      disabled={props.disabled}
      ref={el}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (e.detail === 0 || r.height === 0) return props.onStrike();
        const t = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        props.onStrike(Math.round(127 - t * 126));
      }}
    >
      <span class={styles.stoneKey} aria-hidden="true">{props.keyHint}</span>
    </button>
  );
}

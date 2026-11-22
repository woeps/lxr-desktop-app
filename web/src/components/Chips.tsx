import { For } from "solid-js";
import { useSession } from "../state/session";
import type { ParamDef } from "../generated/params";
import { isLocked, setValue, valueOf } from "./param";
import styles from "./Chips.module.css";

/** Segmented control for a list parameter with up to 4 values: a radio group with arrow keys. */
export function Chips(props: { def: ParamDef }) {
  const session = useSession();
  const names = () => props.def.values ?? [];
  const index = () => valueOf(session, props.def) - props.def.min;
  const choose = (i: number) => setValue(session, props.def, props.def.min + i);

  function onKeyDown(e: KeyboardEvent) {
    const n = names().length;
    let to: number;
    switch (e.key) {
      case "ArrowRight": case "ArrowDown": to = Math.min(n - 1, index() + 1); break;
      case "ArrowLeft": case "ArrowUp": to = Math.max(0, index() - 1); break;
      case "Home": to = 0; break;
      case "End": to = n - 1; break;
      default: return;
    }
    e.preventDefault();
    choose(to);
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role=radio]")[to]?.focus();
  }

  return (
    <div class={styles.chips} role="radiogroup" aria-label={props.def.label} onKeyDown={onKeyDown}>
      <For each={names()}>
        {(name, i) => (
          <button
            type="button"
            role="radio"
            class={styles.chip}
            aria-checked={index() === i() ? "true" : "false"}
            aria-disabled={isLocked(session, props.def) ? "true" : undefined}
            tabindex={index() === i() ? 0 : -1}
            onClick={() => choose(i())}
          >
            {name}
          </button>
        )}
      </For>
    </div>
  );
}

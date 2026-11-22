import { For } from "solid-js";
import type { ParamDef } from "../generated/params";
import { outputValue } from "../midi/encode";
import { aliasTitle, choiceOf, choicesFor } from "../model/outputs";
import { useSession } from "../state/session";
import { isLocked, setValue, valueOf } from "./param";
import styles from "./Chips.module.css";

/** Output choice: main, left, right and (for voices) FX. A stored alias shows as its equivalent. */
export function OutputChips(props: { def: ParamDef }) {
  const session = useSession();
  const shown = () => choiceOf(valueOf(session, props.def)).label;
  return (
    <div class={styles.chips} role="radiogroup" aria-label={props.def.label}
      title={aliasTitle(valueOf(session, props.def))}>
      <For each={choicesFor(props.def)}>
        {(c) => (
          <button type="button" role="radio" class={styles.chip} data-choice={c.label}
            aria-checked={shown() === c.label ? "true" : "false"}
            aria-disabled={isLocked(session, props.def) ? "true" : undefined}
            tabindex={shown() === c.label ? 0 : -1}
            onClick={() => setValue(session, props.def, outputValue(c.label))}>
            {c.label}
          </button>
        )}
      </For>
    </div>
  );
}

import { createEffect, For, Match, Show, Switch } from "solid-js";
import type { ParamDef } from "../generated/params";
import { useSession } from "../state/session";
import { iconInput, renderIcon } from "../visual/icons";
import { Chips } from "./Chips";
import { LiquidBar } from "./LiquidBar";
import { isLocked, resetValue, setValue, valueOf } from "./param";
import { TargetSelect } from "./TargetSelect";
import { OutputChips } from "./OutputChips";
import { aliasTitle, choiceOf, isOutputParam, outParamOf, panDims, PAN_NOTE } from "../model/outputs";
import styles from "./ParamRow.module.css";

const isTarget = (d: ParamDef) => d.name.startsWith("target_lfo") || d.name.startsWith("vel_dest");

/**
 * One parameter: live icon, label, modulation badges, value, control, lock and reset (design 4.9).
 * `badges` are texts such as "M1" supplied by the card that knows the bindings.
 */
export function ParamRow(props: { def: ParamDef; badges?: readonly string[] }) {
  const session = useSession();
  const value = () => valueOf(session, props.def);
  const locked = () => isLocked(session, props.def);
  // R3.6: marked when different from the sound as last loaded or saved.
  const modified = () => value() !== session.state.baseline.values[props.def.id];
  const shown = () => props.def.values?.[value() - props.def.min] ?? String(value());

  const dimmed = () => { const o = outParamOf(props.def); return !!o && panDims(valueOf(session, o)); };
  const tip = () => dimmed() ? PAN_NOTE : (isOutputParam(props.def) ? aliasTitle(value()) : undefined) ?? props.def.desc;

  let iconBox!: HTMLSpanElement;
  createEffect(
    () => renderIcon(props.def.icon, iconInput(props.def, value())),
    (svg) => iconBox.replaceChildren(svg),
  );

  return (
    <div class={styles.row} title={tip()} data-param={props.def.name}
      data-dimmed={dimmed() ? "true" : undefined} style={dimmed() ? { opacity: "0.4" } : undefined}>
      <span class={styles.dot} data-modified={modified() ? "true" : "false"} />
      <span ref={iconBox} class={styles.icon} />
      <span class={styles.label}>{props.def.label}</span>
      <For each={props.badges ?? []}>{(b) => <span class={styles.badge}>{b}</span>}</For>
      <Show when={!isTarget(props.def)}>
        <span class={styles.value} data-testid="value">{isOutputParam(props.def) ? choiceOf(value()).label : props.def.kind === "enum" ? shown() : value()}</span>
      </Show>
      <Switch>
        <Match when={isTarget(props.def)}><TargetSelect def={props.def} /></Match>
        <Match when={isOutputParam(props.def)}><OutputChips def={props.def} /></Match>
        <Match when={props.def.kind === "num"}><LiquidBar def={props.def} /></Match>
        <Match when={(props.def.values?.length ?? 0) <= 4}><Chips def={props.def} /></Match>
        <Match when={true}>
          <select
            class={styles.select}
            aria-label={props.def.label}
            aria-disabled={locked() ? "true" : undefined}
            onChange={(e) => {
              setValue(session, props.def, props.def.min + Number(e.currentTarget.value));
              e.currentTarget.value = String(value() - props.def.min);
            }}
          >
            <For each={props.def.values ?? []}>
              {(n, i) => <option value={String(i())} selected={i() === value() - props.def.min}>{n}</option>}
            </For>
          </select>
        </Match>
      </Switch>
      <button type="button" class={styles.tool} aria-label={`reset ${props.def.label}`}
        disabled={locked()} onClick={() => resetValue(session, props.def)}>↺</button>
      <button type="button" class={[styles.tool, locked() && styles.on]}
        aria-label={`lock ${props.def.label}`} aria-pressed={locked() ? "true" : "false"}
        onClick={() => session.toggleLock(props.def.id)}>🔒</button>
    </div>
  );
}

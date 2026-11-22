import { createEffect, For, Match, Show, Switch } from "solid-js";
import { MOD_TARGETS, PARAMS, type ParamDef } from "../generated/params";
import { badgesFor, bindings, contestedIds, targetIndex } from "../model/links";
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
 * Badges (M<n>, O<n>, own first) and the contested ring come from the twelve bindings of the kit
 * (design 4.12.8). In pick mode a bindable row is outlined and a click or Enter binds it.
 */
export function ParamRow(props: { def: ParamDef }) {
  const session = useSession();
  const all = () => bindings(session.state.current.values);
  const badges = () => badgesFor(all(), props.def.id, props.def.voice);
  const contested = () => contestedIds(all()).has(props.def.id);
  const pickable = () => session.state.pick !== null && typeof session.state.page === "number"
    && !isTarget(props.def) && MOD_TARGETS.includes(props.def.id);
  function bind(): void {
    const page = session.state.page, mode = session.state.pick;
    if (typeof page !== "number" || !mode) return;
    const name = mode === "vel_dest" ? `vel_dest_${page + 1}` : `target_lfo${page + 1}`;
    const target = PARAMS.find((p) => p.name === name)!;
    setValue(session, target, target.min + targetIndex(props.def.id));
    session.setPick(null);
  }
  const intercept = (e: Event) => { if (pickable()) { e.preventDefault(); e.stopPropagation(); bind(); } };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Enter") intercept(e); };
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
      data-dimmed={dimmed() ? "true" : undefined}
      data-contested={contested() ? "true" : undefined} data-pickable={pickable() ? "true" : undefined}
      tabindex={pickable() ? 0 : undefined}
      ref={(el: HTMLElement) => { el.addEventListener("click", intercept, true); el.addEventListener("keydown", onKey, true); }}
      style={dimmed() ? { opacity: "0.4" } : undefined}>
      <span class={styles.dot} data-modified={modified() ? "true" : "false"} />
      <span ref={iconBox} class={styles.icon} />
      <span class={styles.label}>{props.def.label}</span>
      <For each={badges()}>
        {(b) => <span class={styles.badge} data-badge={b.text} data-kind={b.kind} data-own={b.own ? "true" : "false"}>{b.text}</span>}
      </For>
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

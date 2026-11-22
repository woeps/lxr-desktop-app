import { For } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { ParamDef } from "../generated/params";
import { ParamRow } from "./ParamRow";
import styles from "./Journey.module.css";

export type BoxKind = "station" | "return" | "mentor" | "bindings" | "oracle";

/**
 * One box of the journey: ribbon title, subtitle, a slot for the frame (task 9.2) and one for the
 * picture (task 9.3), then one ParamRow per parameter (design 4.12.2, 4.12.3).
 * shortcut: frame and picture slots are empty elements until tasks 9.2 and 9.3.
 */
export function Station(props: {
  station: string; numeral?: string; title: string; subtitle: string; rows: readonly ParamDef[];
  kind?: BoxKind; children?: JSX.Element;
}) {
  return (
    <section class={[styles.box, props.kind && props.kind !== "station" && styles[props.kind]]}
      data-station={props.station} aria-label={props.title}>
      <div class={styles.slot} data-slot="frame" />
      <h3 class={styles.ribbon}>
        {props.numeral && <span class={styles.numeral}>{props.numeral}</span>}
        <span data-part="title">{props.title}</span>
      </h3>
      <p class={styles.subtitle} data-part="subtitle">{props.subtitle}</p>
      <div class={styles.slot} data-slot="picture" />
      <For each={props.rows}>{(def) => <ParamRow def={def} />}</For>
      {props.children}
    </section>
  );
}

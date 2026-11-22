import { createEffect, For, onCleanup } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { ParamDef } from "../generated/params";
import { useSession } from "../state/session";
import { frameSvg, type FrameId } from "../visual/frames";
import { picInput, PICTURE_IDS, vignetteSvg, type PictureId, type Voice } from "../visual/vignettes";
import { ParamRow } from "./ParamRow";
import styles from "./Journey.module.css";

export type BoxKind = "station" | "return" | "mentor" | "bindings" | "oracle";

/**
 * One box of the journey: ribbon title, subtitle, a slot for the frame (task 9.2) and one for the
 * picture (task 9.3), then one ParamRow per parameter (design 4.12.2, 4.12.3).
 * The frame (design 4.12.4) is rebuilt from the measured size on every resize.
 * shortcut: the picture slot is an empty element until task 9.3; without ResizeObserver (jsdom) the
 * frame is built once from offsetWidth/offsetHeight, falling back to 132 x 200.
 */
function mountFrame(box: HTMLElement, id: FrameId) {
  const slot = box.querySelector<HTMLElement>("[data-slot=frame]")!;
  const draw = () => slot.replaceChildren(frameSvg(id, box.offsetWidth || 132, box.offsetHeight || 200));
  draw();
  if (typeof ResizeObserver === "undefined") return;
  const ro = new ResizeObserver(draw);
  ro.observe(box);
  onCleanup(() => ro.disconnect());
}

export function Station(props: {
  station: string; numeral?: string; title: string; subtitle: string; rows: readonly ParamDef[];
  kind?: BoxKind; voice?: Voice; children?: JSX.Element;
}) {
  const session = useSession();
  const voice = () => props.voice ?? (props.rows[0]?.voice as Voice | undefined);
  let pic!: HTMLDivElement;
  if ((PICTURE_IDS as readonly string[]).includes(props.station)) {
    // Ambient time, strike glow and level stay 0 until the animation loop (task 10).
    createEffect(
      () => (voice() === undefined ? undefined : vignetteSvg(props.station as PictureId, picInput(voice()!, session.state.current.values))),
      (svg) => { if (svg) pic.replaceChildren(svg); else pic.replaceChildren(); },
    );
  }
  return (
    <section class={[styles.box, props.kind && props.kind !== "station" && styles[props.kind]]}
      data-station={props.station} aria-label={props.title}
      ref={(el: HTMLElement) => queueMicrotask(() => mountFrame(el, props.station as FrameId))}>
      <div class={styles.slot} data-slot="frame" />
      <h3 class={styles.ribbon}>
        {props.numeral && <span class={styles.numeral}>{props.numeral}</span>}
        <span data-part="title">{props.title}</span>
      </h3>
      <p class={styles.subtitle} data-part="subtitle">{props.subtitle}</p>
      <div class={styles.slot} data-slot="picture" ref={pic} />
      <For each={props.rows}>{(def) => <ParamRow def={def} />}</For>
      {props.children}
    </section>
  );
}

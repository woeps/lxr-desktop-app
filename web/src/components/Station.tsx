import { createEffect, For, getOwner, onCleanup, runWithOwner, type Owner } from "solid-js";
import { bindStyle } from "../visual/css";
import type { JSX } from "@solidjs/web";
import type { ParamDef } from "../generated/params";
import { useSession } from "../state/session";
import type { Live } from "../state/live";
import { voiceLevels } from "../visual/overlay";
import { frameSvg, type FrameId } from "../visual/frames";
import { picInput, PICTURE_IDS, vignetteSvg, type PictureId, type Voice } from "../visual/vignettes";
import { ParamRow } from "./ParamRow";
import styles from "./Journey.module.css";

export type BoxKind = "station" | "return" | "mentor" | "bindings" | "oracle";

/**
 * One box of the journey: ribbon title, a slot for the frame (task 9.2) and one for the
 * picture (task 9.3), then one ParamRow per parameter (design 4.12.2, 4.12.3).
 * The frame (design 4.12.4) is rebuilt from the measured size on every resize.
 * shortcut: the picture slot is an empty element until task 9.3; without ResizeObserver (jsdom) the
 * frame is built once from offsetWidth/offsetHeight, falling back to 132 x 200.
 */
function mountFrame(box: HTMLElement, id: FrameId, owner: Owner | null) {
  const slot = box.querySelector<HTMLElement>("[data-slot=frame]")!;
  const draw = () => slot.replaceChildren(frameSvg(id, box.offsetWidth || 132, box.offsetHeight || 200));
  draw();
  if (typeof ResizeObserver === "undefined") return;
  const ro = new ResizeObserver(draw);
  ro.observe(box);
  runWithOwner(owner, () => onCleanup(() => ro.disconnect())); // called from a microtask, outside the component body
}

export function Station(props: {
  station: string; numeral?: string; title: string; rows: readonly ParamDef[];
  kind?: BoxKind; voice?: Voice; live?: Live; onPicture?: () => void; children?: JSX.Element;
}) {
  const owner = getOwner();
  const session = useSession();
  const voice = () => props.voice ?? (props.rows[0]?.voice as Voice | undefined);
  let pic!: HTMLDivElement;
  bindStyle(() => pic, () => ({ cursor: props.onPicture ? "pointer" : undefined }));
  if ((PICTURE_IDS as readonly string[]).includes(props.station)) {
    // Ambient time and strike glow come from the page's animation loop; the level is the last bridge's.
    createEffect(
      () => {
        if (voice() === undefined) return undefined;
        const values = session.state.current.values;
        const glow = props.live?.glow() ?? 0;
        const base = picInput(voice()!, values);
        const level = voice()! >= 0 ? voiceLevels(base, glow)[6]! : 0;
        return vignetteSvg(props.station as PictureId, picInput(voice()!, values, { t: props.live?.t() ?? 0, glow, level }));
      },
      (svg) => { if (svg) pic.replaceChildren(svg); else pic.replaceChildren(); },
    );
  }
  return (
    <section class={[styles.box, props.kind && props.kind !== "station" && styles[props.kind]]}
      data-station={props.station} aria-label={props.title}
      ref={(el: HTMLElement) => queueMicrotask(() => mountFrame(el, props.station as FrameId, owner))}>
      <div class={styles.slot} data-slot="frame" />
      <h3 class={styles.ribbon}>
        {props.numeral && <span class={styles.numeral}>{props.numeral}</span>}
        <span data-part="title">{props.title}</span>
      </h3>
      <div class={styles.slot} data-slot="picture" ref={pic}
        onClick={() => props.onPicture?.()} />
      <For each={props.rows}>{(def) => <ParamRow def={def} />}</For>
      {props.children}
    </section>
  );
}

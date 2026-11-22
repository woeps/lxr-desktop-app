import { createEffect, For } from "solid-js";
import { useSession } from "../state/session";
import { voicePage } from "../model/stations";
import { ParamRow } from "./ParamRow";
import { PAGES, voiceOf } from "./voices";
import styles from "./Shell.module.css";

/**
 * Only the shown page's rows are in the DOM (R3.1).
 * shortcut: plain boxes with rows; the journey layout replaces this in tasks 9.x.
 */
export function VoicePage() {
  const session = useSession();
  const info = () => PAGES.find((p) => p.page === session.state.page)!;
  let el!: HTMLElement;
  createEffect(() => info().color, (c) => el.style.setProperty("--voice", c));
  return (
    <section role="tabpanel" id="voice-panel" aria-labelledby={`shield-${session.state.page}`} class={styles.page}
      ref={el}>
      <h2>{info().name}</h2>
      <For each={voicePage(voiceOf(session.state.page))}>
        {(box) => (
          <fieldset class={styles.box}>
            <legend>{box.station}</legend>
            <For each={box.rows}>{(def) => <ParamRow def={def} />}</For>
          </fieldset>
        )}
      </For>
    </section>
  );
}

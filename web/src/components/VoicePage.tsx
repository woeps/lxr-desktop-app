import { createEffect, For, Show } from "solid-js";
import { useSession } from "../state/session";
import { voicePage } from "../model/stations";
import { JourneyPage } from "./JourneyPage";
import { ParamRow } from "./ParamRow";
import { PAGES, voiceOf } from "./voices";
import styles from "./Shell.module.css";

/**
 * Only the shown page's rows are in the DOM (R3.1).
 * Voice pages use the journey layout; shortcut: the Cauldron keeps plain boxes until task 9.4.
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
      <Show when={voiceOf(session.state.page) !== -1} fallback={
      <For each={voicePage(voiceOf(session.state.page))}>
        {(box) => (
          <fieldset class={styles.box}>
            <legend>{box.station}</legend>
            <For each={box.rows}>{(def) => <ParamRow def={def} />}</For>
          </fieldset>
        )}
      </For>
      }>
        <JourneyPage voice={voiceOf(session.state.page) as 0 | 1 | 2 | 3 | 4 | 5} />
      </Show>
    </section>
  );
}

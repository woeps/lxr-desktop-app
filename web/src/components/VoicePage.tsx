import { createEffect, Show } from "solid-js";
import { useSession } from "../state/session";
import { JourneyPage } from "./JourneyPage";
import { PAGES, voiceOf } from "./voices";
import { CauldronPage } from "./CauldronPage";
import styles from "./Shell.module.css";

/**
 * Only the shown page's rows are in the DOM (R3.1).
 * Voice pages use the journey layout; the Cauldron has its own three stations.
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
      <Show when={voiceOf(session.state.page) !== -1} fallback={<CauldronPage />}>
        <JourneyPage voice={voiceOf(session.state.page) as 0 | 1 | 2 | 3 | 4 | 5} />
      </Show>
    </section>
  );
}

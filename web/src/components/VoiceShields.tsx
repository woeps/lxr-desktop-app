import { For } from "solid-js";
import { useSession, type Page } from "../state/session";
import { paramsOfVoice } from "../model/params";
import { PAGES, voiceOf } from "./voices";
import styles from "./Shell.module.css";

/** Seven shields as a tablist; arrows move and select, Home/End jump (design 4.9). */
export function VoiceShields() {
  const session = useSession();
  const modified = (page: Page) =>
    paramsOfVoice(voiceOf(page)).filter((p) => session.state.current.values[p.id] !== session.state.baseline.values[p.id]).length;

  function onKeyDown(e: KeyboardEvent) {
    const i = PAGES.findIndex((p) => p.page === session.state.page);
    let to: number;
    switch (e.key) {
      case "ArrowRight": to = (i + 1) % PAGES.length; break;
      case "ArrowLeft": to = (i + PAGES.length - 1) % PAGES.length; break;
      case "Home": to = 0; break;
      case "End": to = PAGES.length - 1; break;
      default: return;
    }
    e.preventDefault();
    session.setPage(PAGES[to]!.page);
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role=tab]")[to]?.focus();
  }

  return (
    <div role="tablist" aria-label="Voices" class={styles.shields} onKeyDown={onKeyDown}>
      <For each={PAGES}>
        {(p) => (
          <button
            type="button" role="tab" id={`shield-${p.page}`}
            class={styles.shield}
            aria-label={p.name}
            aria-selected={session.state.page === p.page ? "true" : "false"}
            aria-controls="voice-panel"
            tabindex={session.state.page === p.page ? 0 : -1}
            ref={(el: HTMLButtonElement) => el.style.setProperty("--shield", p.color)}
            onClick={() => session.setPage(p.page)}
          >
            <span aria-hidden="true">{p.short}</span>
            <span class={styles.count} aria-hidden="true" data-count={modified(p.page)}>
              {modified(p.page) > 0 ? modified(p.page) : ""}
            </span>
          </button>
        )}
      </For>
    </div>
  );
}

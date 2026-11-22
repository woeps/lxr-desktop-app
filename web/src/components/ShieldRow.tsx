import { createSignal, For, Show } from "solid-js";
import { useApp } from "../state/app";
import { useSession, type Page } from "../state/session";
import { rollAll, rollVoice } from "../state/roll";
import { paramsOfVoice } from "../model/params";
import { shellIcon } from "../visual/shellIcons";
import { Popover } from "./Popover";
import { SplitButton } from "./SplitButton";
import { PAGES, voiceOf } from "./voices";
import styles from "./Shell.module.css";

const ROLL_ALL_STEPS = [10, 25, 50, 75, 100];

/** The selected shield's amount button: opens a popover with a 0..100 % slider. */
function AmountButton() {
  const app = useApp();
  const [open, setOpen] = createSignal(false);
  let btn: HTMLButtonElement | undefined;
  return (
    <span class={styles.amount}>
      <button
        type="button" ref={btn} class={styles.amountBtn}
        aria-label="Roll amount" aria-haspopup="dialog" aria-expanded={open() ? "true" : "false"}
        onClick={() => setOpen(!open())}
      >{app.settings.state.rollVoice} %</button>
      <Popover open={open()} onClose={() => setOpen(false)} anchor={() => btn} role="dialog" label="Roll amount">
        <label class={styles.amountLabel}>
          Voice roll amount
          <input
            type="range" min="0" max="100" step="1" aria-label="Voice roll amount"
            value={app.settings.state.rollVoice}
            onInput={(e) => app.settings.set({ rollVoice: Number(e.currentTarget.value) })}
          />
          <output>{app.settings.state.rollVoice} %</output>
        </label>
      </Popover>
    </span>
  );
}

/**
 * Seven shields as a tablist, each voice with a dice button and the selected one with an amount
 * button, then Roll all with its own amount. Only the tab buttons have role tab.
 */
export function ShieldRow() {
  const app = useApp();
  const session = useSession();
  const modified = (page: Page) =>
    paramsOfVoice(voiceOf(page)).filter((p) => session.state.current.values[p.id] !== session.state.baseline.values[p.id]).length;

  function onKeyDown(e: KeyboardEvent) {
    // Only a tab button moves the selection; dice, amount and slider keep their own keys.
    if (!(e.target as HTMLElement).matches("[role=tab]")) return;
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
    <div class={styles.shieldRow}>
      <div role="tablist" aria-label="Voices" class={styles.shields} onKeyDown={onKeyDown}>
        <For each={PAGES}>
          {(p) => {
            const selected = () => session.state.page === p.page;
            return (
              <span
                role="presentation" class={styles.shieldWrap} data-selected={selected() ? "true" : "false"}
                ref={(el: HTMLElement) => el.style.setProperty("--shield", p.color)}
              >
                <button
                  type="button" role="tab" id={`shield-${p.page}`}
                  class={styles.shield}
                  aria-label={p.name}
                  aria-selected={selected() ? "true" : "false"}
                  aria-controls="voice-panel"
                  tabindex={selected() ? 0 : -1}
                  onClick={() => session.setPage(p.page)}
                >
                  <span aria-hidden="true">{p.short}</span>
                  <span class={styles.count} aria-hidden="true" data-count={modified(p.page)}>
                    {modified(p.page) > 0 ? modified(p.page) : ""}
                  </span>
                </button>
                <Show when={p.page !== "cauldron"}>
                  <button
                    type="button" class={styles.dice} aria-label={`Roll ${p.name}`} title={`Roll ${p.name}`}
                    onClick={() => { session.setPage(p.page); rollVoice(app, voiceOf(p.page), app.settings.state.rollVoice); }}
                  >
                    <span aria-hidden="true">{shellIcon("dice")}</span>
                  </button>
                  <Show when={selected()}><AmountButton /></Show>
                </Show>
              </span>
            );
          }}
        </For>
      </div>
      <SplitButton
        label="Roll all"
        icon={() => shellIcon("dice")}
        menuLabel="Roll all amount"
        onPress={() => rollAll(app, app.settings.state.rollAll)}
        menu={
          <For each={ROLL_ALL_STEPS}>
            {(n) => (
              <button type="button" role="menuitem" onClick={() => app.settings.set({ rollAll: n })}>
                {n} %{app.settings.state.rollAll === n ? " ✓" : ""}
              </button>
            )}
          </For>
        }
      />
      <span class={styles.rollAllAmount} aria-hidden="true">{app.settings.state.rollAll} %</span>
    </div>
  );
}

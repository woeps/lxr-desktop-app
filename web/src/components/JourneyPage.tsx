import { createMemo, createSignal, For, onCleanup } from "solid-js";
import { PARAMS, type Station as StationId } from "../generated/params";
import { stationRows } from "../model/stations";
import { headingOf } from "../model/headings";
import { hotFor } from "../model/caption";
import { Caption } from "./Caption";
import { useSession } from "../state/session";
import { useApp } from "../state/app";
import { createLive } from "../state/live";
import { picInput } from "../visual/vignettes";
import { JourneyOverlay } from "./JourneyOverlay";
import { valueOf } from "./param";
import { BindingsCard, MentorCard, OracleCard } from "./cards";
import { Station } from "./Station";
import styles from "./Journey.module.css";

type Voice = 0 | 1 | 2 | 3 | 4 | 5;

/** Eight stations in signal order; "return" has no parameters (design 4.12.3). */
const JOURNEY: readonly { id: StationId | "return"; numeral: string; }[] = [
  { id: "call", numeral: "I" },
  { id: "hero", numeral: "II" },
  { id: "threshold", numeral: "III" },
  { id: "trials", numeral: "IV" },
  { id: "ordeal", numeral: "V" },
  { id: "forge", numeral: "VI" },
  { id: "roadBack", numeral: "VII" },
  { id: "return", numeral: "VIII" },
];

/** The journey of one voice: stations in a row, then the LFO, target and velocity cards (design 4.12.2). */
export function JourneyPage(props: { voice: Voice }) {
  const session = useSession();
  const app = useApp();
  const live = createLive(app, () => props.voice, (v, key) => picInput(v as Voice, session.state.current.values).raw(key));
  const out = () => PARAMS.find((p) => p.voice === props.voice && p.name.startsWith("audio_out"))!;
  const outText = () => out().values![valueOf(session, out()) - out().min] ?? "";
  const toFx = () => outText() === "FX";
  // Esc leaves pick mode (design 4.12.8).
  const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && session.state.pick) session.setPick(null); };
  document.addEventListener("keydown", onEsc);
  onCleanup(() => document.removeEventListener("keydown", onEsc));
  // Pointing at or focusing a row lights everything downstream (design 4.12.9).
  const [pointed, setPointed] = createSignal<number | null>(null);
  const hot = createMemo(() => {
    const id = pointed();
    const def = id === null ? undefined : PARAMS.find((p) => p.id === id);
    return def ? hotFor(def, session.state.current.values) : null;
  });
  const point = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.("[data-param]");
    const def = el ? PARAMS.find((p) => p.name === el.getAttribute("data-param") && p.voice === props.voice) : undefined;
    setPointed(def ? def.id : null);
  };
  const leave = () => setPointed(null);
  return (
    <div class={styles.journey} data-journey={props.voice}
      ref={(el: HTMLElement) => {
        for (const t of ["mouseover", "focusin"]) el.addEventListener(t, point);
        for (const t of ["mouseleave", "focusout"]) el.addEventListener(t, leave);
      }}>
      <JourneyOverlay voice={props.voice} live={live} hot={hot()} />
      <div class={styles.stations}>
        <For each={JOURNEY}>
          {(s) => (
            <Station station={s.id} numeral={s.numeral} title={headingOf(s.id, props.voice)} kind={s.id === "return" ? "return" : "station"} voice={props.voice} live={live}
              rows={s.id === "return" ? [] : stationRows(props.voice, s.id)}
              onPicture={s.id === "return" && toFx() ? () => session.setPage("cauldron") : undefined}>
              {s.id === "return" && <p class={styles.result} data-part="result">{outText()}</p>}
              {s.id === "return" && toFx() && (
                <button type="button" data-part="open-cauldron" onClick={() => session.setPage("cauldron")}>
                  Open the Cauldron
                </button>
              )}
            </Station>
          )}
        </For>
      </div>
      <div class={styles.cards}>
        <MentorCard rows={stationRows(props.voice, "mentor")} />
        <BindingsCard rows={stationRows(props.voice, "bindings")} />
        <OracleCard rows={stationRows(props.voice, "oracle")} />
      </div>
      <Caption text={hot()?.caption ?? ""} />
    </div>
  );
}

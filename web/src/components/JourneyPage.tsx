import { For } from "solid-js";
import { PARAMS, type Station as StationId } from "../generated/params";
import { stationRows } from "../model/stations";
import { useSession } from "../state/session";
import { valueOf } from "./param";
import { BindingsCard, MentorCard, OracleCard } from "./cards";
import { Station } from "./Station";
import styles from "./Journey.module.css";

type Voice = 0 | 1 | 2 | 3 | 4 | 5;

/** Eight stations in signal order; "return" has no parameters (design 4.12.3). */
const JOURNEY: readonly { id: StationId | "return"; numeral: string; title: string }[] = [
  { id: "call", numeral: "I", title: "The Call" },
  { id: "hero", numeral: "II", title: "The Hero" },
  { id: "threshold", numeral: "III", title: "The Threshold" },
  { id: "trials", numeral: "IV", title: "Road of Trials" },
  { id: "ordeal", numeral: "V", title: "The Ordeal" },
  { id: "forge", numeral: "VI", title: "The Forge" },
  { id: "roadBack", numeral: "VII", title: "The Road Back" },
  { id: "return", numeral: "VIII", title: "Return" },
];

const SUBTITLES: Record<string, string> = {
  call: "modulator", hero: "oscillator", threshold: "click + the fall", trials: "filter",
  ordeal: "amp envelope", forge: "drive", roadBack: "mixer", return: "to the speakers",
};

/** Subtitle of a station on a voice: snare Call is "noise", cymbal and hi-hat Threshold are "click". */
export function subtitleOf(station: string, voice: Voice): string {
  if (station === "call" && voice === 3) return "noise";
  if (station === "threshold" && voice >= 4) return "click";
  return SUBTITLES[station]!;
}

/** The journey of one voice: stations in a row, then Mentor, Bindings and Oracle (design 4.12.2). */
export function JourneyPage(props: { voice: Voice }) {
  const session = useSession();
  const out = () => PARAMS.find((p) => p.voice === props.voice && p.name.startsWith("audio_out"))!;
  const outText = () => out().values![valueOf(session, out()) - out().min] ?? "";
  const toFx = () => outText() === "FX";
  return (
    <div class={styles.journey} data-journey={props.voice}>
      <div class={styles.trail} data-slot="trail" />
      <div class={styles.stations}>
        <For each={JOURNEY}>
          {(s) => (
            <Station station={s.id} numeral={s.numeral} title={s.title}
              subtitle={subtitleOf(s.id, props.voice)} kind={s.id === "return" ? "return" : "station"} voice={props.voice}
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
    </div>
  );
}

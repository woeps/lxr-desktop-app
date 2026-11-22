import { For, Show } from "solid-js";
import type { ParamDef } from "../generated/params";
import { headingOf } from "../model/headings";
import { badgeText, bindings, incoming, targetLabel, VOICE_NAMES, type Voice } from "../model/links";
import { useSession } from "../state/session";
import { Station } from "./Station";

/** Mentor: the LFO's character only (design 4.12.8). */
export const MentorCard = (props: { rows: readonly ParamDef[] }) => (
  <Station station="mentor" kind="mentor" title={headingOf("mentor", props.rows[0]!.voice)} rows={props.rows} />
);

/** Bindings: where the Mentor and the Oracle act, then the read-only list of modulators from other voices. */
export function BindingsCard(props: { rows: readonly ParamDef[] }) {
  const session = useSession();
  const voice = () => props.rows[0]!.voice as Voice;
  const list = () => incoming(bindings(session.state.current.values), voice());
  return (
    <Station station="bindings" kind="bindings" title={headingOf("bindings", props.rows[0]!.voice)} rows={props.rows}>
      <Show when={list().length > 0}>
        <div data-part="incoming">
          <p>Incoming from other voices, set on their pages</p>
          <ul>
            <For each={list()}>
              {(b) => <li data-kind={b.kind}>{`${badgeText(b)} (${VOICE_NAMES[b.voice]}) → ${targetLabel(b.target)}`}</li>}
            </For>
          </ul>
        </div>
      </Show>
    </Station>
  );
}

/** Oracle: velocity strength only. */
export const OracleCard = (props: { rows: readonly ParamDef[] }) => (
  <Station station="oracle" kind="oracle" title={headingOf("oracle", props.rows[0]!.voice)} rows={props.rows} />
);

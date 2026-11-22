import { For } from "solid-js";
import { MOD_TARGETS, PARAMS, type ParamDef } from "../generated/params";
import { useSession, type PickMode } from "../state/session";
import { headingOf } from "../model/headings";
import { isLocked, setValue, valueOf } from "./param";
import styles from "./TargetSelect.module.css";

const VOICE_NAMES = ["Drum 1", "Drum 2", "Drum 3", "Snare", "Cymbal", "Hi-hat"];
const byId = new Map(PARAMS.map((p) => [p.id, p]));

/** Group of a target index: the voice and station of the parameter it points at. */
function groupOf(index: number): string {
  const id = MOD_TARGETS[index];
  const p = id == null ? undefined : byId.get(id);
  if (!p) return index === 0 ? "None" : "Other";
  return `${p.voice < 0 ? "Cauldron" : VOICE_NAMES[p.voice]} · ${headingOf(p.station, p.voice)}`;
}

/** Targets of `def` grouped for the menu, in first-appearance order (design 4.9). */
export function targetGroups(def: ParamDef): { label: string; items: { index: number; name: string }[] }[] {
  const groups = new Map<string, { index: number; name: string }[]>();
  (def.values ?? []).forEach((name, index) => {
    const g = groupOf(index);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ index, name });
  });
  return [...groups].map(([label, items]) => ({ label, items }));
}

const pickMode = (def: ParamDef): Exclude<PickMode, null> => (def.name.startsWith("vel_dest") ? "vel_dest" : "target_lfo");

/** Menu for `target_lfoN` and `vel_dest_N`, with the "pick" button of pick-to-bind mode (4.12.8). */
export function TargetSelect(props: { def: ParamDef }) {
  const session = useSession();
  const current = () => valueOf(session, props.def) - props.def.min;
  const mode = () => pickMode(props.def);
  return (
    <span class={styles.target}>
      <select
        class={styles.select}
        aria-label={props.def.label}
        aria-disabled={isLocked(session, props.def) ? "true" : undefined}
        onChange={(e) => {
          setValue(session, props.def, props.def.min + Number(e.currentTarget.value));
          e.currentTarget.value = String(current()); // a locked row snaps back
        }}
      >
        <For each={targetGroups(props.def)}>
          {(g) => (
            <optgroup label={g.label}>
              <For each={g.items}>
                {(t) => <option value={String(t.index)} selected={t.index === current()}>{t.name}</option>}
              </For>
            </optgroup>
          )}
        </For>
      </select>
      <button
        type="button"
        class={styles.pick}
        aria-pressed={session.state.pick === mode() ? "true" : "false"}
        onClick={() => session.setPick(session.state.pick === mode() ? null : mode())}
      >
        pick
      </button>
    </span>
  );
}

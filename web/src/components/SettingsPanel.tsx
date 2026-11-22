import { createSignal, For, untrack } from "solid-js";
import { useApp } from "../state/app";
import { SLOTS } from "../state/settings";
import { SidePanel } from "./SidePanel";
import { SLOT_NAMES } from "./voices";

const slots = Array.from({ length: SLOTS }, (_, i) => i);

/** Settings panel: module MIDI setup: channels, global channel and trigger notes. Kept in the browser, never sent. */
export function SettingsPanel(props: { onClose: () => void }) {
  const { settings } = useApp();
  // A snapshot taken on open: edits stay in the panel until Save.
  const [channels, setChannels] = createSignal(untrack(() => [...settings.state.channels]));
  const [global, setGlobal] = createSignal(untrack(() => settings.state.global));
  const [notes, setNotes] = createSignal(untrack(() => [...settings.state.notes]));
  const put = (list: number[], i: number, v: string) => list.map((x, j) => (j === i ? Number(v) : x));
  function save() {
    settings.set({ channels: channels(), global: global(), notes: notes() });
    props.onClose();
  }
  return (
    <SidePanel title="Settings" glyph="settings">
      <p>
        These settings describe the module. They are not sent to it: the firmware does not accept its
        MIDI settings over MIDI, so change them with the console (for example <code>set midi_chan_1 3</code>).
        The page keeps them in this browser, separate from sounds. If they differ from the module's,
        the module ignores the page.
      </p>
      <For each={slots}>
        {(i) => (
          <div>
            <span>{SLOT_NAMES[i]}</span>{" "}
            <label>Channel{" "}
              <input type="number" min={1} max={16} aria-label={`Channel ${SLOT_NAMES[i]}`} value={channels()[i]}
                onInput={(e) => setChannels(put(channels(), i, e.currentTarget.value))} />
            </label>{" "}
            <label>Trigger note{" "}
              <input type="number" min={0} max={127} aria-label={`Note ${SLOT_NAMES[i]}`} value={notes()[i]}
                onInput={(e) => setNotes(put(notes(), i, e.currentTarget.value))} />
            </label>
          </div>
        )}
      </For>
      <label>Global channel (0 = off){" "}
        <input type="number" min={0} max={16} aria-label="Global channel" value={global()}
          onInput={(e) => setGlobal(Number(e.currentTarget.value))} />
      </label>
      <div>
        <button type="button" onClick={save}>Save setup</button>
        <button type="button" onClick={props.onClose}>Cancel</button>
      </div>
    </SidePanel>
  );
}

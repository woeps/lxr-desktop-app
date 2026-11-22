import { For } from "solid-js";
import { useApp } from "../state/app";
import { SLOT_COLORS, SLOT_NAMES } from "./voices";
import { RuneStone } from "./RuneStone";
import styles from "./Shell.module.css";

/** Rune stones 1 to 7, velocity, pitch, Play all and Panic (R4). Keys are handled in App.tsx. */
export function AuditionBar() {
  const app = useApp();
  const { settings } = app;
  return (
    <div class={styles.bar} role="group" aria-label="Audition">
      <For each={SLOT_NAMES}>
        {(name, i) => (
          <RuneStone name={name} keyHint={settings.state.keys[i()]!} color={SLOT_COLORS[i()]!}
            disabled={app.busy() || !app.hasOutput()} onStrike={(v) => app.strike(i(), v)} />
        )}
      </For>
      <label>
        Velocity{" "}
        <input type="range" min={1} max={127} value={settings.state.velocity} aria-label="Velocity"
          onInput={(e) => settings.set({ velocity: Number(e.currentTarget.value) })} />
        <output>{settings.state.velocity}</output>
      </label>
      <label>
        Pitch{" "}
        <input type="range" min={0} max={127} value={settings.state.pitch} aria-label="Pitch"
          onInput={(e) => settings.set({ pitch: Number(e.currentTarget.value) })} />
        <output>{settings.state.pitch}</output>
      </label>
      <button type="button" disabled={app.busy() || !app.hasOutput()} onClick={() => app.playAll()}>
        Play all <kbd>{settings.state.keys[7]}</kbd>
      </button>
      <button type="button" disabled={!app.hasOutput()} onClick={() => app.panic()}>Panic</button>
    </div>
  );
}

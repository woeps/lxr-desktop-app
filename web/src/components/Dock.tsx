import { For, onSettled, Show } from "solid-js";
import { useApp } from "../state/app";
import { trackHeight } from "../visual/layout";
import { guardOutput, useShell } from "../state/shell";
import { ConnectionPill } from "./ConnectionPill";
import { RuneStone } from "./RuneStone";
import { SLOT_COLORS, SLOT_NAMES } from "./voices";
import controls from "./Controls.module.css";
import styles from "./Dock.module.css";

/**
 * Fixed bottom dock (R6): connection pill, rune stones 1 to 7, velocity, pitch, Play all, Panic and
 * the collapse button. Collapsed it keeps the pill and an expand button; keys are handled in App.tsx.
 * Actions that need an output open the connection popover instead when there is none (R6.4).
 */
export function Dock() {
  const app = useApp();
  const shell = useShell();
  const { settings } = app;
  const collapsed = () => settings.state.dockCollapsed;
  const strike = guardOutput(app, shell, (slot: number, v?: number) => app.strike(slot, v));
  const playAll = guardOutput(app, shell, () => app.playAll());
  const panic = guardOutput(app, shell, () => app.panic());
  let box: HTMLDivElement | undefined;
  onSettled(() => (box ? trackHeight(box, "--dock-h") : undefined));
  return (
    <div ref={box} class={styles.dock} role="group" aria-label="Audition" data-collapsed={collapsed() ? "true" : "false"}>
      <ConnectionPill />
      <Show when={!collapsed()}>
        <For each={SLOT_NAMES}>
          {(name, i) => (
            <RuneStone name={name} keyHint={settings.state.keys[i()]!} color={SLOT_COLORS[i()]!}
              disabled={app.busy()} onStrike={(v) => strike(i(), v)} />
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
        <button type="button" class={controls.btn} disabled={app.busy()} onClick={() => playAll()}>
          Play all <kbd>{settings.state.keys[7]}</kbd>
        </button>
        <button type="button" class={controls.btn} onClick={() => panic()}>Panic</button>
      </Show>
      <button type="button" class={controls.btn} aria-expanded={collapsed() ? "false" : "true"}
        aria-label={collapsed() ? "Expand dock" : "Collapse dock"}
        onClick={() => settings.set({ dockCollapsed: !collapsed() })}>
        {collapsed() ? "▴" : "▾"}
      </button>
    </div>
  );
}

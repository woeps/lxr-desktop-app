import { useSession } from "../state/session";
import type { ParamDef } from "../generated/params";
import { isLocked, resetValue, setValue, valueOf } from "./param";
import { clamp } from "../model/sound";
import styles from "./LiquidBar.module.css";

export const FALLBACK_WIDTH = 200; // px, when the track has no layout (tests)
export const FINE = 0.25;          // Shift drags at a quarter of the speed (design 4.9)
export const BIG_STEP = 10;        // Shift+arrow, PageUp, PageDown

/**
 * Slider of a numeric parameter (design 4.9). A drag is relative to where it is grabbed: the value
 * moves by the pointer's travel as a share of the track width, never jumps to the pointer. The
 * drag writes with `replay` (sent, no history) and records ONE history step on release.
 */
export function LiquidBar(props: { def: ParamDef }) {
  const session = useSession();
  const value = () => valueOf(session, props.def);
  const locked = () => isLocked(session, props.def);
  const pct = () => {
    const span = props.def.max - props.def.min;
    return span > 0 ? ((value() - props.def.min) / span) * 100 : 0;
  };

  let track!: HTMLDivElement;
  let drag: { x: number; start: number; acc: number; shown: number } | null = null;

  function onKeyDown(e: KeyboardEvent) {
    const d = props.def;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const big = e.shiftKey ? BIG_STEP : 1;
    let to: number;
    switch (e.key) {
      case "ArrowRight": case "ArrowUp": to = value() + big; break;
      case "ArrowLeft": case "ArrowDown": to = value() - big; break;
      case "PageUp": to = value() + BIG_STEP; break;
      case "PageDown": to = value() - BIG_STEP; break;
      case "Home": to = d.min; break;
      case "End": to = d.max; break;
      case "Backspace": to = d.def; break;
      default: return;
    }
    e.preventDefault();
    setValue(session, d, clamp(d.id, to));
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || locked()) return;
    drag = { x: e.clientX, start: value(), acc: value(), shown: value() };
    try { track.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
    track.focus();
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || locked()) return;
    const d = props.def;
    const width = track.getBoundingClientRect().width || FALLBACK_WIDTH;
    drag.acc += ((e.clientX - drag.x) / width) * (d.max - d.min) * (e.shiftKey ? FINE : 1);
    drag.x = e.clientX;
    drag.acc = Math.min(d.max, Math.max(d.min, drag.acc)); // overshoot past an end is not stored
    const to = Math.round(drag.acc);
    if (to === drag.shown) return;
    drag.shown = to;
    session.applyChanges([[d.id, value(), to]], { replay: true });
  }

  function endDrag() {
    if (!drag) return;
    const { start, shown } = drag;
    drag = null;
    if (start !== shown) session.history.push([[props.def.id, start, shown]]);
  }

  return (
    <div
      ref={track}
      class={[styles.bar, locked() && styles.locked]}
      role="slider"
      tabindex={0}
      aria-label={props.def.label}
      aria-valuemin={props.def.min}
      aria-valuemax={props.def.max}
      aria-valuenow={value()}
      aria-readonly={locked() ? "true" : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDblClick={() => resetValue(session, props.def)}
    >
      <div class={styles.fill} style={{ width: `${pct()}%` }} />
    </div>
  );
}

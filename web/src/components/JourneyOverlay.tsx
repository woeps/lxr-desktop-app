import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { useSession } from "../state/session";
import type { Live } from "../state/live";
import {
  bridgeLabels, buildOverlay, computeGeometry, hasFall, voiceLevels, type OverlayLive, type OverlayView, type Rect,
} from "../visual/overlay";
import { picInput, type Voice } from "../visual/vignettes";
import { bindings, contestedIds } from "../model/links";
import { paramById } from "../model/params";
import { threadPaths, type Thread } from "../visual/threads";

interface Measured { w: number; h: number; stations: Rect[]; cards: Rect[] }

/** Boxes of a journey, relative to the journey element: eight stations, then Mentor, Bindings, Oracle. */
export function measure(journey: HTMLElement): Measured {
  const rects = [...journey.querySelectorAll<HTMLElement>("[data-station]")].map((b) => ({
    x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight,
  }));
  let w = 0, h = 0;
  for (const r of rects) { w = Math.max(w, r.x + r.w); h = Math.max(h, r.y + r.h); }
  return { w, h, stations: rects.slice(0, 8), cards: rects.slice(8, 11) };
}

/**
 * One SVG over the journey (design 4.12.7): trail, seals, landmarks, bridges, the fall and the chains.
 * It sits in the journey element (position: relative) and reads the sizes of the boxes; the geometry
 * is recomputed only when a ResizeObserver reports a change.
 * shortcut: without ResizeObserver (jsdom) the geometry is measured once after mount.
 */
export function JourneyOverlay(props: { voice: Voice; live: Live }) {
  const session = useSession();
  const [measured, setMeasured] = createSignal<Measured | null>(null);
  let slot!: HTMLDivElement;
  let view: OverlayView | null = null;

  const input = () => picInput(props.voice, session.state.current.values);
  const geometry = createMemo(() => {
    const m = measured();
    if (!m) return null;
    return computeGeometry(m, m.stations, m.cards, hasFall(props.voice) ? input().u("modamnt") : null);
  });
  const labels = createMemo(() => bridgeLabels(input()));
  const live = createMemo((): OverlayLive => ({
    t: props.live.t(), walk: props.live.walk(), fall: props.live.fall(),
    levels: voiceLevels(input(), props.live.glow()),
  }));

  createEffect(() => ({ g: geometry(), l: labels() }), ({ g, l }) => {
    if (!g) { slot.replaceChildren(); view = null; return; }
    view = buildOverlay(g, l);
    slot.replaceChildren(view.svg);
    view.update(live());
  });
  createEffect(live, (l) => view?.update(l));

  // Threads from the Bindings card to the bound station (design 4.12.8); other voices draw none.
  let threadSlot!: HTMLDivElement;
  const threads = createMemo((): Thread[] => {
    const m = measured();
    if (!m) return [];
    const all = bindings(session.state.current.values);
    const hot = contestedIds(all);
    return all.filter((b) => b.voice === props.voice && b.target !== null).flatMap((b) => {
      const p = paramById(b.target!);
      return p && p.voice === props.voice ? [{ kind: b.kind, station: p.station, contested: hot.has(b.target!) }] : [];
    });
  });
  createEffect(() => ({ m: measured(), t: threads() }), ({ m, t }) => {
    threadSlot.replaceChildren(m ? threadPaths(m.stations, m.cards[1], t, m.w, m.h) : document.createComment(""));
  });

  function mount(el: HTMLDivElement) {
    queueMicrotask(() => {
      const journey = el.parentElement;
      if (!journey) return;
      const run = () => setMeasured(measure(journey));
      run();
      if (typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(run);
      ro.observe(journey);
      journey.querySelectorAll("[data-station]").forEach((b) => ro.observe(b));
      onCleanup(() => ro.disconnect());
    });
  }
  return (
    <>
      <div data-slot="overlay" style={{ position: "absolute", left: 0, top: 0 }} ref={(el: HTMLDivElement) => { slot = el; mount(el); }} />
      <div data-slot="threads" style={{ position: "absolute", left: 0, top: 0, "pointer-events": "none" }} ref={threadSlot} />
    </>
  );
}

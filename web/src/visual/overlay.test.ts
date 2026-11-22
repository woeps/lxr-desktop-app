import { describe, expect, it } from "vitest";
import { PARAMS } from "../generated/params";
import { bridgeOpacity, LEVEL_FLOOR } from "../model/levels";
import {
  bridgeLabels, buildOverlay, computeGeometry, hasFall, litCount, trailPoint, voiceLevels, type Rect,
} from "./overlay";
import { picInput } from "./vignettes";

const stations: Rect[] = Array.from({ length: 8 }, (_, i) => ({ x: i * 172, y: 70, w: i === 7 ? 100 : 132, h: 200 }));
const cards: Rect[] = [{ x: 0, y: 330, w: 300, h: 150 }, { x: 344, y: 330, w: 330, h: 150 }, { x: 718, y: 330, w: 240, h: 150 }];
const size = { w: 1300, h: 500 };

describe("computeGeometry", () => {
  const g = computeGeometry(size, stations, cards, 0.5);
  it("puts a seal and a landmark above every station, centred on its box", () => {
    expect(g.seals).toHaveLength(8);
    expect(g.glyphs).toHaveLength(8);
    g.seals.forEach((p, i) => { expect(p[0]).toBe(stations[i]!.x + stations[i]!.w / 2); expect(p[1]).toBeLessThan(70); });
    g.glyphs.forEach((p, i) => expect(p[1]).toBeLessThan(g.seals[i]![1]));
  });
  it("runs the trail through the seals and has seven bridges across the gaps", () => {
    expect(g.trail).toHaveLength(7);
    g.trail.forEach((s, i) => { expect(s.a).toEqual(g.seals[i]); expect(s.b).toEqual(g.seals[i + 1]); });
    expect(g.bridges).toHaveLength(7);
    g.bridges.forEach((b, i) => {
      expect(b.a[0]).toBe(stations[i]!.x + stations[i]!.w);
      expect(b.b[0]).toBe(stations[i + 1]!.x);
    });
  });
  it("puts a chain in each gap between cards on the same row, none when they wrap", () => {
    expect(g.chains).toEqual([[322, 370], [696, 370]]);
    const wrapped = computeGeometry(size, stations, [cards[0]!, { ...cards[1]!, y: 500 }, cards[2]!], null);
    expect(wrapped.chains).toHaveLength(0);
  });
  it("widens the fall arc with its depth and omits it without a pitch envelope", () => {
    const shallow = computeGeometry(size, stations, cards, 0).fall!;
    const deep = computeGeometry(size, stations, cards, 1).fall!;
    expect(deep.width).toBeGreaterThan(shallow.width);
    expect(computeGeometry(size, stations, cards, null).fall).toBeNull();
  });
  it("stays finite for unmeasured (all zero) boxes", () => {
    const z = computeGeometry({ w: 0, h: 0 }, stations.map(() => ({ x: 0, y: 0, w: 0, h: 0 })), [], 0);
    expect(JSON.stringify(z)).not.toMatch(/null|NaN|Infinity/);
  });
  it("walks the trail from the first to the last seal", () => {
    expect(trailPoint(g, 0)).toEqual(g.seals[0]);
    const end = trailPoint(g, 1);
    expect(end[0]).toBeCloseTo(g.seals[7]![0]);
    expect(end[1]).toBeCloseTo(g.seals[7]![1]);
  });
  it("lights the seals the hero has passed", () => {
    expect(litCount(null)).toBe(0);
    expect(litCount(0)).toBe(1);
    expect(litCount(0.5)).toBe(4);
    expect(litCount(1)).toBe(8);
  });
});

describe("voices", () => {
  it("only the drums and the snare have a pitch envelope, as in the parameter table", () => {
    for (let v = 0; v < 6; v++) {
      expect(hasFall(v)).toBe(PARAMS.some((p) => p.voice === v && p.slotKey === "mod_eg"));
    }
  });
  it("draws the fall only on those voices", () => {
    for (let v = 0; v < 6; v++) {
      const g = computeGeometry(size, stations, cards, hasFall(v) ? 0.5 : null);
      const { svg } = buildOverlay(g, []);
      expect(svg.querySelector("[data-part=fall]") !== null).toBe(v <= 3);
      expect(svg.querySelector("[data-part=fall-label]")?.textContent ?? "the fall").toBe("the fall");
    }
  });
});

const values = (over: Record<string, number> = {}) => {
  const v = new Uint8Array(400);
  for (const p of PARAMS) v[p.id] = over[p.name] ?? p.def;
  return v;
};

describe("levels on the bridges", () => {
  it("follow the parameters and the strike glow", () => {
    const quiet = voiceLevels(picInput(0, values({ filter_type_1: 0, filter_freq_1: 0, vol1: 0 })), 0);
    expect(quiet[3]).toBeCloseTo(0.15);
    expect(quiet[6]).toBe(LEVEL_FLOOR);
    const loud = voiceLevels(picInput(0, values({ filter_type_1: 7, vol1: 127 })), 1);
    expect(loud[3]).toBe(1);
    expect(loud[6]).toBe(1);
    const lit = voiceLevels(picInput(0, values({ filter_type_1: 7, vol1: 127, drive1: 0 })), 0.25);
    expect(lit[4]).toBeCloseTo(0.25);
  });
  it("sets the bridge opacity to max(0.35, level)", () => {
    const { svg, update } = buildOverlay(computeGeometry(size, stations, cards, null), []);
    update({ t: 0, walk: null, fall: 0, levels: [0.06, 1, 1, 0.5, 0.2, 0.9, 0.06] });
    const op = [...svg.querySelectorAll("[data-bridge]")].map((g) => Number(g.getAttribute("opacity")));
    expect(op).toEqual([0.06, 1, 1, 0.5, 0.2, 0.9, 0.06].map(bridgeOpacity));
  });
  it("labels the first, third and fifth bridge from the parameters", () => {
    expect(bridgeLabels(picInput(0, values()))).toEqual(["FM", null, null, null, null, null, null]);
    const l = bridgeLabels(picInput(0, values({ mix_mod_1: 1, trans1_vol: 5, volume_mod_on_off1: 1 })));
    expect([l[0], l[2], l[4]]).toEqual(["mix", "+click", "×vel"]);
    expect(bridgeLabels(picInput(3, values()))[0]).toBe("mix");
  });
});

describe("buildOverlay", () => {
  const g = computeGeometry(size, stations, cards, 0.5);
  it("hides the hero without a strike and walks it along the trail with one", () => {
    const { svg, update } = buildOverlay(g, []);
    const hero = svg.querySelector("[data-part=hero]")!;
    const live = { t: 1, walk: null, fall: 0, levels: [1, 1, 1, 1, 1, 1, 1] };
    update(live);
    expect(hero.getAttribute("display")).toBe("none");
    expect(svg.querySelectorAll("[data-seal][data-lit='1']")).toHaveLength(0);
    update({ ...live, walk: 0.5 });
    expect(hero.hasAttribute("display")).toBe(false);
    expect(svg.querySelectorAll("[data-seal][data-lit='1']")).toHaveLength(4);
    expect(svg.querySelectorAll("[data-glyph][data-lit='1']")).toHaveLength(4);
  });
  it("lights the fall arc while the pitch drop runs", () => {
    const { svg, update } = buildOverlay(g, []);
    const arc = svg.querySelector("[data-part=fall]")!;
    update({ t: 0, walk: 0.2, fall: 1, levels: [] });
    expect(arc.getAttribute("stroke")).toBe("#fff");
    update({ t: 0, walk: null, fall: 0, levels: [] });
    expect(arc.getAttribute("stroke")).toBe("var(--gold)");
  });
});

import { describe, expect, it } from "vitest";
import { PARAMS } from "../generated/params";
import { CAULDRON_STATIONS, brewRows, hiddenParams, stationRows, voicePage } from "./stations";

const names = (voice: number, station: Parameters<typeof stationRows>[1]) =>
  stationRows(voice as 0, station).map((p) => p.name);

describe("stations", () => {
  it("places every parameter once, or lists it as hidden", () => {
    const placed = new Map<number, number>();
    for (const voice of [-1, 0, 1, 2, 3, 4, 5] as const) {
      for (const { rows } of voicePage(voice)) for (const p of rows) placed.set(p.id, (placed.get(p.id) ?? 0) + 1);
    }
    const hidden = new Set(hiddenParams().map((p) => p.id));
    for (const p of PARAMS) {
      if (hidden.has(p.id)) expect(placed.has(p.id), p.name).toBe(false);
      else expect(placed.get(p.id), p.name).toBe(1);
    }
    expect(placed.size + hidden.size).toBe(PARAMS.length);
  });

  it("hides voice_lfoN and fx_reverb_type only", () => {
    expect(hiddenParams().map((p) => p.name)).toEqual([
      "voice_lfo1", "voice_lfo2", "voice_lfo3", "voice_lfo4", "voice_lfo5", "voice_lfo6", "fx_reverb_type",
    ]);
  });

  it("shows 35, 34, 35, 35 rows for drum, snare, cymbal and hi-hat", () => {
    const count = (v: 0 | 1 | 2 | 3 | 4 | 5) => voicePage(v).reduce((n, b) => n + b.rows.length, 0);
    expect([count(0), count(1), count(2)]).toEqual([35, 35, 35]);
    expect([count(0), count(3), count(4), count(5)]).toEqual([35, 34, 35, 35]);
  });

  it("orders the boxes and their rows as in design 4.12.3", () => {
    expect(voicePage(0).map((b) => b.station)).toEqual([
      "call", "hero", "threshold", "trials", "ordeal", "forge", "roadBack", "mentor", "bindings", "oracle",
    ]);
    expect(names(0, "call")).toEqual(["fmamnt1", "fm_freq1", "mod_wave_drum1", "mix_mod_1"]);
    expect(names(0, "hero")).toEqual(["osc_wave_drum1", "coarse1", "fine1", "pwm_1"]);
    expect(names(0, "threshold")).toEqual([
      "trans1_wave", "trans1_vol", "trans1_freq", "modamnt1", "mod_eg1", "pitch_slope1",
    ]);
    expect(names(0, "trials")).toEqual(["filter_type_1", "filter_freq_1", "reso_1", "filter_drive_1"]);
    expect(names(0, "ordeal")).toEqual(["veloa1", "velod1", "vol_slope1", "volume_mod_on_off1"]);
    expect(names(0, "forge")).toEqual(["drive1"]);
    expect(names(0, "roadBack")).toEqual(["vol1", "voice_decimation1", "pan1", "audio_out1"]);
    expect(names(0, "mentor")).toEqual(["wave_lfo1", "freq_lfo1", "amount_lfo1", "retrigger_lfo1", "offset_lfo1"]);
    expect(names(0, "bindings")).toEqual(["target_lfo1", "vel_dest_1"]);
    expect(names(0, "oracle")).toEqual(["velo_mod_amt_1"]);

    expect(names(3, "call")).toEqual(["noise_freq1", "mix1"]);
    expect(names(3, "ordeal")).toEqual(["veloa4", "velod4", "vol_slope4", "repeat4", "volume_mod_on_off4"]);
    expect(names(3, "forge")).toEqual(["snare_distortion"]);
    expect(names(4, "call")).toEqual([
      "wave2_cym", "mod_osc_f1_cym", "mod_osc_gain1_cym", "wave3_cym", "mod_osc_f2_cym", "mod_osc_gain2_cym",
    ]);
    expect(names(4, "threshold")).toEqual(["trans5_wave", "trans5_vol", "trans5_freq"]);
    expect(names(5, "ordeal")).toEqual(["veloa6", "velod6_closed", "velod6_open", "vol_slope6", "volume_mod_on_off6"]);
    expect(names(5, "threshold")).toEqual(["trans6_wave", "trans6_vol", "trans6_freq"]);
  });

  it("builds the Cauldron from three boxes and shows only what the effect uses", () => {
    expect(voicePage(-1).map((b) => b.station)).toEqual([...CAULDRON_STATIONS]);
    expect(names(-1, "pour")).toEqual(["fx_dry_wet", "fx_routing"]);
    expect(names(-1, "millstone")).toEqual(["voice_decimation_all"]);
    const brew = (e: string) => brewRows(e).map((p) => p.name);
    expect(brew("off")).toEqual(["fx_type"]);
    expect(brew("drv")).toEqual(["fx_type", "fx_dist_type", "fx_p1", "fx_p2", "fx_p3", "fx_p4"]);
    expect(brew("rng")).toEqual(["fx_type", "fx_p1", "fx_wave"]);
    expect(brew("cmp")).toEqual(["fx_type", "fx_p1", "fx_p2", "fx_p3", "fx_p4", "fx_ratio"]);
    expect(brew("del")).toEqual(["fx_type", "fx_p1", "fx_p2", "fx_p3", "fx_p4", "fx_delay_type"]);
  });
});

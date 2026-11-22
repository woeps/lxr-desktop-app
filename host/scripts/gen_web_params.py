#!/usr/bin/env python3
# Copyright (C) 2026 Erica Synths
# SPDX-License-Identifier: GPL-3.0-only
"""Writes web/src/generated/params.ts, the parameter data of the web UI.

It reads engine/src/param_table.c through gen_midi_map.py (the same parser as the
README MIDI table) and engine/include/lxr/engine.h (the store command). Run it again
after changing the parameter table or the station rules below:

    host/scripts/gen_web_params.py
"""
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_midi_map import ROOT, SOUND_PARAM_COUNT, describe, read_enums, read_table  # noqa: E402

OUT = os.path.join(ROOT, "web", "src", "generated", "params.ts")

# (name regex, station, order in the station, icon kind, short label, slotKey)
# Stations and their rows follow design 4.12.3. slotKey is the same for the matching
# parameter of drum 1, 2 and 3 (voice copy/paste, R3.7).
RULES = [
    # I The Call
    (r"fmamnt\d", "call", 0, "fma", "FM amount", "fmamnt"),
    (r"fm_freq\d", "call", 1, "fmf", "mod pitch", "fm_freq"),
    (r"mod_wave_drum\d", "call", 2, "wave", "mod wave", "mod_wave"),
    (r"mix_mod_\d", "call", 3, "mode", "mode", "mix_mod"),
    (r"noise_freq1", "call", 0, "noise", "noise pitch", "noise_freq"),
    (r"mix1", "call", 1, "nmix", "noise mix", "noise_mix"),
    (r"wave2_(cym|hh)", "call", 0, "wave", "moon 1 wave", "mod1_wave"),
    (r"mod_osc_f1(_cym)?", "call", 1, "fmf", "moon 1 pitch", "mod1_freq"),
    (r"mod_osc_gain1(_cym)?", "call", 2, "fma", "moon 1 FM", "mod1_gain"),
    (r"wave3_(cym|hh)", "call", 3, "wave", "moon 2 wave", "mod2_wave"),
    (r"mod_osc_f2(_cym)?", "call", 4, "fmf", "moon 2 pitch", "mod2_freq"),
    (r"mod_osc_gain2(_cym)?", "call", 5, "fma", "moon 2 FM", "mod2_gain"),
    # II The Hero
    (r"osc_wave_(drum\d|snare)|wave1_(cym|hh)", "hero", 0, "wave", "wave", "osc_wave"),
    (r"coarse\d", "hero", 1, "pitch", "pitch", "coarse"),
    (r"fine\d", "hero", 2, "fine", "fine", "fine"),
    (r"pwm_\d", "hero", 3, "pwm", "pulse width", "pwm"),
    # III The Threshold
    (r"trans\d_wave", "threshold", 0, "tw", "click sample", "trans_wave"),
    (r"trans\d_vol", "threshold", 1, "tv", "click level", "trans_vol"),
    (r"trans\d_freq", "threshold", 2, "tf", "click pitch", "trans_freq"),
    (r"modamnt\d", "threshold", 3, "da", "fall depth", "modamnt"),
    (r"mod_eg\d", "threshold", 4, "dt", "fall time", "mod_eg"),
    (r"pitch_slope\d", "threshold", 5, "dc", "fall curve", "pitch_slope"),
    # IV Road of Trials
    (r"filter_type_\d", "trials", 0, "ft", "type", "filter_type"),
    (r"filter_freq_\d", "trials", 1, "fc", "cutoff", "filter_freq"),
    (r"reso_\d", "trials", 2, "fq", "resonance", "reso"),
    (r"filter_drive_\d", "trials", 3, "fd", "drive", "filter_drive"),
    # V The Ordeal
    (r"veloa\d", "ordeal", 0, "aa", "attack", "veloa"),
    (r"velod\d", "ordeal", 1, "ad", "decay", "velod"),
    (r"velod6_closed", "ordeal", 1, "ad", "decay closed", "velod_closed"),
    (r"velod6_open", "ordeal", 2, "ad", "decay open", "velod_open"),
    (r"vol_slope\d", "ordeal", 3, "ac", "curve", "vol_slope"),
    (r"repeat\d", "ordeal", 4, "rp", "repeats", "repeat"),
    (r"volume_mod_on_off\d", "ordeal", 5, "tog", "velocity to volume", "volume_mod_on_off"),
    # VI The Forge
    (r"drive\d|snare_distortion|cymbal_distortion|hat_distortion", "forge", 0, "dr", "drive", "drive"),
    # VII The Road Back
    (r"vol\d", "roadBack", 0, "vo", "volume", "vol"),
    (r"voice_decimation\d", "roadBack", 1, "dec", "sample rate", "voice_decimation"),
    (r"pan\d", "roadBack", 2, "pan", "pan", "pan"),
    (r"audio_out\d", "roadBack", 3, "out", "output", "audio_out"),
    # Mentor
    (r"wave_lfo\d", "mentor", 0, "lw", "wave", "wave_lfo"),
    (r"freq_lfo\d", "mentor", 1, "lr", "rate", "freq_lfo"),
    (r"amount_lfo\d", "mentor", 2, "la", "amount", "amount_lfo"),
    (r"retrigger_lfo\d", "mentor", 3, "rt", "restarts on", "retrigger_lfo"),
    (r"offset_lfo\d", "mentor", 4, "lo", "start phase", "offset_lfo"),
    (r"voice_lfo\d", "mentor", 5, "rt", "voice", "voice_lfo"),
    # Bindings
    (r"target_lfo\d", "bindings", 0, "link", "Mentor to", "target_lfo"),
    (r"vel_dest_\d", "bindings", 1, "link", "Oracle to", "vel_dest"),
    # Oracle
    (r"velo_mod_amt_\d", "oracle", 0, "va", "strength", "velo_mod_amt"),
    # Cauldron
    (r"fx_type", "brew", 0, "fxt", "effect", "fx_type"),
    (r"fx_dist_type", "brew", 1, "fxd", "distortion", "fx_dist_type"),
    (r"fx_p[1-4]", "brew", 2, "fxp", "fx_p", "fx_p"),   # order and label fixed below
    (r"fx_ratio", "brew", 6, "rat", "ratio", "fx_ratio"),
    (r"fx_wave", "brew", 7, "wave", "ring wave", "fx_wave"),
    (r"fx_delay_type", "brew", 8, "dly", "delay type", "fx_delay_type"),
    (r"fx_reverb_type", "brew", 9, "fxt", "reverb", "fx_reverb_type"),
    (r"fx_dry_wet", "pour", 0, "dw", "dry/wet", "fx_dry_wet"),
    (r"fx_routing", "pour", 1, "out", "output", "fx_routing"),
    (r"voice_decimation_all", "millstone", 0, "dec", "sample rate", "voice_decimation_all"),
]
# fx_p1..fx_p4 keep their number in order and label
FXP = re.compile(r"fx_p([1-4])")
# volume, pan and output routing stay out of Randomise (R3)
MIX = re.compile(r"vol\d|pan\d|audio_out\d|fx_routing")
# the module's own MIDI setup (defaults for R2)
SETTING = re.compile(r"midi_chan_([1-7]|global)|midi_note[1-7]")
OUTPUT_CHOICES = [("main", 0, [1]), ("left", 2, [4]), ("right", 3, [5]), ("FX", 6, [])]


def classify(row):
    """Station, order, icon, label and slotKey of one parameter, or a named error."""
    name = row["name"]
    desc = describe(name)
    for pattern, station, order, icon, label, slot in RULES:
        if re.fullmatch(pattern, name):
            break
    else:
        raise SystemExit(f"no station for parameter '{name}': add it to RULES in {__file__}")
    if not (icon and label):
        raise SystemExit(f"no icon for parameter '{name}': fix its row in RULES in {__file__}")
    m = FXP.fullmatch(name)
    if m:
        n = int(m.group(1))
        order, label, slot = 1 + n, f"fx p{n}", name
    return dict(station=station, order=order, icon=icon, label=label, slotKey=slot, desc=desc)


def check_slot_keys(params):
    by_voice = {}
    for p in params:
        keys = by_voice.setdefault(p["voice"], [])
        if p["slotKey"] in keys:
            raise SystemExit(f"voice {p['voice']}: slotKey '{p['slotKey']}' is used twice ('{p['name']}')")
        keys.append(p["slotKey"])
    ref = set(by_voice.get(0, []))
    for v in (1, 2):
        got = set(by_voice.get(v, []))
        if got != ref:
            raise SystemExit(f"drum {v + 1} and drum 1 have different slotKeys: "
                             f"only in drum 1 {sorted(ref - got)}, only in drum {v + 1} {sorted(got - ref)}")


def fx_labels():
    """fx_p1..fx_p4 names per effect, from the README descriptions ('drv drive, rng frequency, ...')."""
    out = {fx: ["", "", "", ""] for fx in ("drv", "rng", "cmp", "del")}
    for n in range(1, 5):
        text = describe(f"fx_p{n}").split(":", 1)[1]
        for part in text.split(","):
            fx, label = part.strip().split(" ", 1)
            if fx not in out:
                raise SystemExit(f"fx_p{n}: unknown effect '{fx}' in its description")
            out[fx][n - 1] = label
    return out


def read_store():
    src = open(os.path.join(ROOT, "engine", "include", "lxr", "engine.h")).read()
    vals = {}
    for key in ("LXR_NRPN_STORE_BOOT", "LXR_STORE_BOOT_KEY", "LXR_NRPN_NULL"):
        m = re.search(rf"#define\s+{key}\s+(0x[0-9a-fA-F]+|\d+)u?\b", src)
        if not m:
            raise SystemExit(f"engine.h does not define {key}")
        vals[key] = int(m.group(1), 0)
    return vals


def build():
    rows = read_table()
    enums = read_enums()
    names = {r["name"]: r for r in rows}
    params = []
    for r in rows:
        if r["id"] >= SOUND_PARAM_COUNT:
            continue
        c = classify(r)
        params.append(dict(
            id=r["id"], name=r["name"], voice=r["voice"], kind="enum" if r["enum"] else "num",
            min=r["lo"], max=r["hi"], **{"def": r["default"]},
            values=r["enum"], addr={"cc": r["id"] + 1} if r["id"] < 127 else {"nrpn": r["id"] - 128},
            station=c["station"], order=c["order"], icon=c["icon"], label=c["label"], desc=c["desc"],
            slotKey=c["slotKey"], inert=c["desc"].startswith("no effect"),
            mix=bool(MIX.fullmatch(r["name"]))))
    check_slot_keys(params)
    settings = [dict(id=r["id"], name=r["name"], min=r["lo"], max=r["hi"], **{"def": r["default"]})
                for r in rows if SETTING.fullmatch(r["name"])]
    public = {p["name"]: p["id"] for p in params}
    targets = [None if n == "none" else public.get(n) for n in enums["enum_modTargets"]]
    canon = json.dumps(rows, sort_keys=True, separators=(",", ":"))
    store = read_store()
    return dict(
        table_id=hashlib.sha256(canon.encode()).hexdigest()[:16], store=store, params=params,
        settings=settings, targets=targets, fx=fx_labels())


HEADER = """// Generated by host/scripts/gen_web_params.py from engine/src/param_table.c. Do not edit.
export type Station = "call" | "hero" | "threshold" | "trials" | "ordeal" | "forge" | "roadBack"
  | "mentor" | "bindings" | "oracle" | "brew" | "pour" | "millstone";
export type IconKind = %s;
export interface ParamDef {
  id: number; name: string; voice: -1 | 0 | 1 | 2 | 3 | 4 | 5;
  kind: "num" | "enum"; min: number; max: number; def: number;
  values?: readonly string[];
  addr: { cc: number } | { nrpn: number };
  station: Station; order: number; icon: IconKind; label: string;
  desc: string;                      // README "Controls" text, used as tooltip
  slotKey: string; inert: boolean; mix: boolean;
}
export interface SettingDef { id: number; name: string; min: number; max: number; def: number; }
"""


def ts(value):
    return json.dumps(value, ensure_ascii=False)


def render(d):
    icons = sorted({r[3] for r in RULES})
    lines = [HEADER % " | ".join(ts(i) for i in icons)]
    lines.append(f'export const TABLE_ID = {ts(d["table_id"])};')
    s = d["store"]
    lines.append(f'export const STORE = {{ nrpn: {s["LXR_NRPN_STORE_BOOT"]}, key: {s["LXR_STORE_BOOT_KEY"]}, '
                 f'nullNrpn: {s["LXR_NRPN_NULL"]} }} as const;')
    lines.append("export const PARAMS: readonly ParamDef[] = [")
    for p in d["params"]:
        p = {k: v for k, v in p.items() if not (k == "values" and v is None)}
        lines.append("  " + ts(p) + ",")
    lines.append("];")
    lines.append("export const MIDI_SETTINGS: readonly SettingDef[] = [")
    lines += ["  " + ts(p) + "," for p in d["settings"]]
    lines.append("];")
    lines.append("export const MOD_TARGETS: readonly (number | null)[] = " + ts(d["targets"]) + ";")
    choices = [dict(label=l, value=v, aliases=a) for l, v, a in OUTPUT_CHOICES]
    lines.append("export const OUTPUT_CHOICES: readonly { label: \"main\" | \"left\" | \"right\" | \"FX\"; "
                 "value: number; aliases: number[] }[] = " + ts(choices) + ";")
    lines.append('export const FX_LABELS: Record<"drv" | "rng" | "cmp" | "del", [string, string, string, string]> = '
                 + ts(d["fx"]) + ";")
    return "\n".join(lines) + "\n"


def main():
    text = render(build())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="\n") as f:
        f.write(text)


if __name__ == "__main__":
    main()

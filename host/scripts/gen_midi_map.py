#!/usr/bin/env python3
# Copyright (C) 2026 Erica Synths
# SPDX-License-Identifier: GPL-3.0-only
"""Writes the MIDI CC/NRPN table into README.md (between the midi-map markers).

The rows come from engine/src/param_table.c, so the README lists exactly the
parameters the firmware accepts, with their numbers, voices and ranges. Run it
again after changing the parameter table:

    host/scripts/gen_midi_map.py
"""
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BEGIN, END = "<!-- midi-map:begin -->", "<!-- midi-map:end -->"
SOUND_PARAM_COUNT = 247   # LXR_SOUND_PARAM_COUNT: ids above are module settings, not reachable by MIDI
VOICES = ["drum 1", "drum 2", "drum 3", "snare", "cymbal", "hi-hat"]

# description by parameter name; N stands for the voice digit
DESC = [
    (r"osc_wave_(drum\d|snare)|wave1_(cym|hh)", "oscillator waveform"),
    (r"mod_wave_drum\d", "modulator waveform"),
    (r"wave2_(cym|hh)", "modulator 1 waveform"),
    (r"wave3_(cym|hh)", "modulator 2 waveform"),
    (r"coarse\d", "pitch, coarse"),
    (r"fine\d", "pitch, fine (about ±50 cent)"),
    (r"noise_freq1", "noise frequency"),
    (r"mix1", "noise mix"),
    (r"mod_osc_f1(_cym)?", "modulator 1 pitch"),
    (r"mod_osc_f2(_cym)?", "modulator 2 pitch"),
    (r"mod_osc_gain1(_cym)?", "modulator 1 FM amount"),
    (r"mod_osc_gain2(_cym)?", "modulator 2 FM amount"),
    (r"filter_freq_\d", "filter cutoff"),
    (r"reso_\d", "filter resonance"),
    (r"filter_type_\d", "filter type"),
    (r"filter_drive_\d", "filter drive"),
    (r"veloa\d", "amp envelope attack"),
    (r"velod6_closed", "amp envelope decay, closed hi-hat"),
    (r"velod6_open", "amp envelope decay, open hi-hat"),
    (r"velod\d", "amp envelope decay"),
    (r"vol_slope\d", "amp envelope curve"),
    (r"repeat\d", "amp envelope repeats (clap-like retriggers)"),
    (r"mod_eg\d", "pitch envelope decay"),
    (r"modamnt\d", "pitch envelope amount"),
    (r"pitch_slope\d", "pitch envelope curve"),
    (r"fmamnt\d", "FM amount"),
    (r"fm_freq\d", "modulator pitch"),
    (r"vol\d", "volume"),
    (r"pan\d", "pan"),
    (r"drive\d|(snare|cymbal|hat)_distortion", "drive"),
    (r"voice_decimation_all", "sample-rate reduction, all voices"),
    (r"voice_decimation\d", "sample-rate reduction"),
    (r"freq_lfo\d", "LFO rate"),
    (r"amount_lfo\d", "LFO amount"),
    (r"wave_lfo\d", "LFO waveform"),
    (r"voice_lfo\d", "no effect (the LFO destination already selects the voice)"),
    (r"target_lfo\d", "LFO destination: index into the modulation target list (see below)"),
    (r"retrigger_lfo\d", "LFO retrigger"),
    (r"offset_lfo\d", "LFO start phase"),
    (r"mix_mod_\d", "modulator mode: FM, or mixed with the oscillator"),
    (r"volume_mod_on_off\d", "velocity controls the volume (0 off, 1 on)"),
    (r"velo_mod_amt_\d", "velocity modulation amount"),
    (r"vel_dest_\d", "velocity modulation destination: index into the modulation target list (see below)"),
    (r"trans\d_vol", "transient level"),
    (r"trans\d_wave", "transient sample"),
    (r"trans\d_freq", "transient pitch"),
    (r"audio_out\d", "output: St1 main stereo out, L1/R1 left or right only, FX through the effect; St2, L2 and R2 play on the main out"),
    (r"pwm_\d", "pulse width (PWM waveform)"),
    (r"fx_type", "effect"),
    (r"fx_routing", "effect output (as for the voices' output)"),
    (r"fx_dry_wet", "effect dry/wet (0 to 100)"),
    (r"fx_dist_type", "distortion type"),
    (r"fx_p1", "effect parameter 1: drv drive, rng frequency, cmp attack, del time"),
    (r"fx_p2", "effect parameter 2: drv shape 1, cmp release, del time range"),
    (r"fx_p3", "effect parameter 3: drv shape 2, cmp threshold, del filter"),
    (r"fx_p4", "effect parameter 4: drv shape 3, cmp make-up gain, del feedback"),
    (r"fx_ratio", "compressor ratio"),
    (r"fx_wave", "ring modulator waveform"),
    (r"fx_reverb_type", "no effect (this firmware has no reverb)"),
    (r"fx_delay_type", "delay type"),
]


def describe(name):
    for pattern, text in DESC:
        if re.fullmatch(pattern, name):
            return text
    raise SystemExit(f"no description for parameter '{name}': add it to DESC in {__file__}")


def read_table():
    src = open(os.path.join(ROOT, "engine", "src", "param_table.c")).read()
    enums = {}
    for m in re.finditer(r"static const char \*const (enum_\w+)\[\] = \{(.*?)\};", src, flags=re.S):
        enums[m.group(1)] = re.findall(r'"([^"]*)"', m.group(2))
    rows = []
    for m in re.finditer(r'\{ (\d+), "(\w+)", (-?\d+), (\w+), (\d+), (\d+), (\d+), (\w+) \}', src):
        rows.append(dict(id=int(m.group(1)), name=m.group(2), voice=int(m.group(3)),
                         lo=int(m.group(5)), hi=int(m.group(6)), default=int(m.group(7)),
                         enum=enums.get(m.group(8))))
    return rows


def table():
    out = ["| MIDI | Parameter | Voice | Values | Default | Controls |", "|---|---|---|---|---|---|"]
    for r in read_table():
        i = r["id"]
        if i >= SOUND_PARAM_COUNT:
            continue
        where = f"CC {i + 1}" if i < 127 else f"NRPN {i - 128}"
        voice = VOICES[r["voice"]] if r["voice"] >= 0 else "all"
        if r["enum"] and len(r["enum"]) <= 14:
            values = " ".join(f"{n}={v}" for n, v in enumerate(r["enum"]))
            default = r["enum"][r["default"]]
        elif r["enum"]:
            values = f"0 to {r['hi']}"
            default = r["enum"][r["default"]]
        else:
            values = f"{r['lo']} to {r['hi']}"
            default = str(r["default"])
        out.append(f"| {where} | `{r['name']}` | {voice} | {values} | {default} | {describe(r['name'])} |")
    return "\n".join(out)


def targets():
    """The modulation target list, one line per block (globals, then each voice)."""
    names = read_enums()["enum_modTargets"]
    lines, cur = [], []
    for i, n in enumerate(names):
        if re.fullmatch(r"coarse\d|wave1_(cym|hh)", n) and cur:
            lines.append(", ".join(cur))
            cur = []
        cur.append(f"{i} `{n}`")
    lines.append(", ".join(cur))
    return "\n\n".join(lines)


def read_enums():
    src = open(os.path.join(ROOT, "engine", "src", "param_table.c")).read()
    return {m.group(1): re.findall(r'"([^"]*)"', m.group(2))
            for m in re.finditer(r"static const char \*const (enum_\w+)\[\] = \{(.*?)\};", src, flags=re.S)}


def replace(text, begin, end, body):
    if begin not in text or end not in text:
        raise SystemExit(f"README.md has no {begin} ... {end} markers")
    a = text.index(begin) + len(begin)
    return text[:a] + "\n" + body + "\n" + text[text.index(end):]


def main():
    path = os.path.join(ROOT, "README.md")
    text = open(path).read()
    new = replace(text, BEGIN, END, table())
    new = replace(new, "<!-- mod-targets:begin -->", "<!-- mod-targets:end -->", targets())
    if "--check" in sys.argv:
        if new != text:
            raise SystemExit("README.md MIDI table is out of date: run host/scripts/gen_midi_map.py")
        return
    open(path, "w").write(new)


if __name__ == "__main__":
    main()

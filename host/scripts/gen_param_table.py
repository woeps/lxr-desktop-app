#!/usr/bin/env python3
"""One-off generator for engine/src/param_table.c (task 4.1).

Reads the parameter model of the old STM32 firmware from git history
(commit 6bf0d8c, the last commit that still had the LCD menu code):

  - parameter_dtypes[] in Core/Src/menu/menu.c   -> value range / enum type
  - name arrays in Core/Inc/menu/MenuText.h       -> enum value names
  - getMaxEntriesForMenu() in menu.c              -> which array belongs to which menu id
  - initKit[] in Core/Src/Preset/initKit.c        -> default values (git HEAD copy)

and the enum values from engine/include/Parameters.h (compiled with gcc).

The output is reviewed by hand and maintained by hand afterwards. Run again only
to compare against the committed table.

Usage: host/scripts/gen_param_table.py > engine/src/param_table.c
"""
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OLD = "6bf0d8c"


def git_show(path):
    return subprocess.check_output(["git", "-C", ROOT, "show", f"{OLD}:{path}"], text=True)


def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return re.sub(r"//[^\n]*", "", s)


# --- 1. enum names and values ------------------------------------------------
def enum_values():
    text = open(os.path.join(ROOT, "engine/include/Parameters.h")).read()
    a = text.index("enum ParamEnums")
    b = text.index("};", a)
    body = strip_comments(text[a:b])
    names = []
    for m in re.finditer(r"\b(PAR_[A-Z0-9_]+|END_OF_SOUND_PARAMETERS|NUM_PARAMS)\b\s*(=[^,\n}]*)?\s*[,\n}]", body):
        if m.group(1) not in names:
            names.append(m.group(1))
    names = [n for n in names if re.fullmatch(r"PAR_[A-Z0-9_]+|END_OF_SOUND_PARAMETERS|NUM_PARAMS", n)]
    with tempfile.TemporaryDirectory() as d:
        c = os.path.join(d, "e.c")
        with open(c, "w") as f:
            f.write('#include <stdio.h>\n#include "Parameters.h"\nint main(void){\n')
            for n in names:
                f.write(f'printf("{n} %d\\n", (int){n});\n')
            f.write("return 0;}\n")
        exe = os.path.join(d, "e")
        subprocess.check_call(["gcc", "-w", "-I" + os.path.join(ROOT, "engine/include"), c, "-o", exe])
        out = subprocess.check_output([exe], text=True)
    vals = []
    for line in out.splitlines():
        n, v = line.split()
        vals.append((n, int(v)))
    return vals


# --- 2. old data types ---------------------------------------------------------
def parse_dtypes():
    menu_c = git_show("Core/Src/menu/menu.c")
    a = menu_c.index("parameter_dtypes[NUM_PARAMS] = {")
    b = menu_c.index("};", a)
    body = strip_comments(menu_c[a + len("parameter_dtypes[NUM_PARAMS] = {"):b])
    items = [x.strip() for x in body.split(",") if x.strip()]
    res = []
    for it in items:
        m = re.search(r"(DTYPE_[A-Za-z0-9_]+)(?:\s*\|\s*\((MENU_[A-Z0-9_]+)\s*<<\s*8\))?", it)
        if not m:
            raise SystemExit(f"cannot parse dtype entry: {it!r}")
        res.append((m.group(1), m.group(2)))
    return res


# --- 3. name arrays --------------------------------------------------------------
def parse_name_arrays():
    t = git_show("Core/Inc/menu/MenuText.h").replace("\r", "")
    arrays = {}
    for m in re.finditer(r"const char (\w+)\[\]\[\d+\]\s*=\s*\{(.*?)\n\s*\};", t, flags=re.S):
        name, body = m.group(1), strip_comments(m.group(2))
        strs = re.findall(r'\{"([^"]*)"\}', body)
        arrays[name] = [s.strip() for s in strs]
    return arrays


def parse_menu_map():
    menu_c = git_show("Core/Src/menu/menu.c")
    a = menu_c.index("static uint8_t getMaxEntriesForMenu(uint8_t menuId)\n{") if "static uint8_t getMaxEntriesForMenu(uint8_t menuId)\n{" in menu_c else menu_c.index("static uint8_t getMaxEntriesForMenu(uint8_t menuId)\r\n{")
    b = menu_c.index("default:", a)
    body = menu_c[a:b]
    mp = {}
    parts = re.split(r"(case MENU_[A-Z0-9_]+:)", body)
    for i in range(1, len(parts) - 1, 2):
        menu = parts[i][len("case "):-1]
        m = re.search(r"(\w+)\[0\]\[0\]", parts[i + 1])
        if m:
            mp[menu] = m.group(1)
    mp.setdefault("MENU_WAVEFORM", "waveformNames")  # its return expression also adds the SD sample count
    return mp


# --- 4. defaults -------------------------------------------------------------------
def init_kit():
    src = open(os.path.join(ROOT, "engine/src/Preset/initKit.c")).read()
    return [int(x, 16) for x in re.findall(r"0x([0-9a-fA-F]{2})", src)]


RANGE = {
    "DTYPE_0B255": (0, 255), "DTYPE_0B127": (0, 127), "DTYPE_PM100": (0, 200),
    "DTYPE_PM63": (0, 127), "DTYPE_1B16": (0, 15), "DTYPE_ON_OFF": (0, 1),
    "DTYPE_0b1": (0, 1), "DTYPE_NOTE_NAME": (0, 127), "DTYPE_0B15": (0, 15),
    "DTYPE_1B64": (0, 63), "DTYPE_0B100": (0, 100),
    "DTYPE_TARGET_SELECTION_LFO": (0, 127), "DTYPE_TARGET_SELECTION_VELO": (0, 127),
    "DTYPE_VOICE_LFO": (0, 127), "DTYPE_AUTOM_TARGET": (0, 127),
}

# Sound-range slots that exist in the enum but have no effect (docs/removed-params.md).
SKIP_NAMES = {"PAR_NONE", "PAR_MOD_WHEEL", "PAR_NRPN_DATA_ENTRY_COARSE", "PAR_MORPH_KIT_DEST",
              "PAR_NRPN_FINE", "PAR_NRPN_COARSE", "PAR_BANK_CHANGE"}
SKIP_PREFIX = ("PAR_SYNC_LFO", "PAR_UNUSED")
# Globals kept (module MIDI settings), with the defaults of preset_loadDefaultGlobals().
GLOBAL_DEFAULTS = {f"PAR_MIDI_CHAN_{i}": 1 for i in range(1, 8)}
GLOBAL_DEFAULTS.update({f"PAR_MIDI_NOTE{i}": 48 for i in range(1, 8)})
GLOBAL_DEFAULTS.update({"PAR_MIDI_CHAN_GLOBAL": 0, "PAR_MIDI_FILT_TX": 15, "PAR_MIDI_FILT_RX": 15})
# Voice-less globals in the sound range have voice -1; per-voice names end in _1.._6.
VOICE_SUFFIX = re.compile(r"_([1-6])$")


def voice_of(short):
    """Voice 0..5 (drum1-3, snare, cymbal, hi-hat) from the parameter name, or -1."""
    if short.startswith(("fx_", "midi_")):
        return -1
    for prefix, v in (("snare", 3), ("cymbal", 4), ("hat_", 5), ("velod6", 5)):
        if short.startswith(prefix):
            return v
    m = re.match(r"trans([1-6])_", short)
    if m:
        return int(m.group(1)) - 1
    for suffix, v in (("_snare", 3), ("_cym", 4), ("_hh", 5)):
        if short.endswith(suffix):
            return v
    m = re.search(r"(?:drum)?([1-6])$", short)
    return int(m.group(1)) - 1 if m else -1


def c_ident(s):
    return re.sub(r"[^A-Za-z0-9_]", "_", s)


def main():
    vals = enum_values()
    end_sound = dict(vals)["END_OF_SOUND_PARAMETERS"]
    num_params = dict(vals)["NUM_PARAMS"]
    dtypes = parse_dtypes()
    if len(dtypes) != num_params:
        sys.stderr.write(f"warning: {len(dtypes)} dtypes for {num_params} params\n")
    arrays = parse_name_arrays()
    menumap = parse_menu_map()
    kit = init_kit()

    # last declared name wins per value (aliases such as PAR_OSC_WAVE_DRUM1 = PAR_MOD_WHEEL)
    by_id = {}
    for n, v in vals:
        if n in ("END_OF_SOUND_PARAMETERS", "NUM_PARAMS"):
            continue
        if n in SKIP_NAMES or n.startswith(SKIP_PREFIX):
            continue
        by_id.setdefault(v, []).append(n)

    keep = []
    for v in sorted(by_id):
        names = by_id[v]
        name = names[-1] if v < end_sound else None
        if v >= end_sound:
            cands = [n for n in names if n in GLOBAL_DEFAULTS]
            if not cands:
                continue
            name = cands[-1]
        keep.append((v, name))

    enum_arrays = {}
    rows = []
    for v, name in keep:
        dt, menu = dtypes[v]
        lo, hi = RANGE.get(dt, (0, 127))
        kind = "LXR_KIND_UINT8"
        ename = "NULL"
        if dt == "DTYPE_MENU":
            arr = menumap.get(menu)
            if arr is None or arr not in arrays:
                raise SystemExit(f"{name}: no name array for {menu}")
            names = arrays[arr]
            if menu == "MENU_WAVEFORM":
                names = names  # user samples (SD card) are gone: only the built-in waves
            enum_arrays[arr] = names
            lo, hi = 0, len(names) - 1
            kind = "LXR_KIND_ENUM"
            ename = f"enum_{arr}"
        if name in GLOBAL_DEFAULTS:
            default = GLOBAL_DEFAULTS[name]
        elif v < end_sound:
            default = kit[8 + v] if 8 + v < len(kit) else 0
        else:
            default = 0
        default = max(lo, min(hi, default))
        short = name[len("PAR_"):].lower()
        voice = voice_of(short) if v < end_sound else -1
        rows.append((v, short, voice, kind, lo, hi, default, ename))

    seen = set()
    for r in rows:
        if r[1] in seen:
            raise SystemExit(f"duplicate name {r[1]}")
        seen.add(r[1])

    p = sys.stdout.write
    p("/*\n * param_table.c: metadata for every engine parameter (generated once by\n"
      " * host/scripts/gen_param_table.py from the old STM32 menu data, then maintained by hand).\n *\n"
      " * Copyright (C) 2012-2026 Erica Synths\n * SPDX-License-Identifier: GPL-3.0-only\n *\n"
      " * This file is part of the LXR firmware. It is licensed under the GNU General\n"
      " * Public License version 3, with the additional permission and terms in\n"
      " * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.\n */\n\n")
    p('#include "lxr/param_info.h"\n#include <string.h>\n\n')
    for arr, names in sorted(enum_arrays.items()):
        p(f"static const char *const enum_{arr}[] = {{\n")
        for n in names:
            p(f'\t"{n}",\n')
        p("};\n\n")
    p("static const lxr_param_info_t paramTable[] = {\n")
    for v, short, voice, kind, lo, hi, default, ename in rows:
        p(f'\t{{ {v}, "{short}", {voice}, {kind}, {lo}, {hi}, {default}, {ename} }},\n')
    p("};\n\n")
    p("""#define LXR_PARAM_TABLE_SIZE (sizeof(paramTable) / sizeof(paramTable[0]))

uint16_t lxr_param_count(void)
{
	return (uint16_t)LXR_PARAM_TABLE_SIZE;
}

const lxr_param_info_t *lxr_param_info(uint16_t index)
{
	return index < LXR_PARAM_TABLE_SIZE ? &paramTable[index] : NULL;
}

const lxr_param_info_t *lxr_param_find_id(uint16_t id)
{
	/* The table is sorted by id. */
	uint16_t lo = 0, hi = (uint16_t)LXR_PARAM_TABLE_SIZE;
	while(lo < hi)
	{
		const uint16_t mid = (uint16_t)((lo + hi) / 2);
		if(paramTable[mid].id == id) return &paramTable[mid];
		if(paramTable[mid].id < id) lo = (uint16_t)(mid + 1); else hi = mid;
	}
	return NULL;
}

const lxr_param_info_t *lxr_param_find(const char *name)
{
	for(uint16_t i = 0; i < LXR_PARAM_TABLE_SIZE; i++)
	{
		if(strcmp(paramTable[i].name, name) == 0) return &paramTable[i];
	}
	return NULL;
}
""")


if __name__ == "__main__":
    main()

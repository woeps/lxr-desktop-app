#!/usr/bin/env python3
"""Turns an old LXR kit file (.SND) into a preset sector image (task 11.3).

    host/scripts/import_kit.py KICKS.SND -o kicks.bin [--slot 3] [--name "Kicks"]

The output is one 4096-byte flash sector in the format of engine/include/lxr/preset.h.
With --slot it also prints the picotool command that writes it into that preset
slot of a 4 MB board (RP2350-Zero, Pico 2). Firmware updates (.uf2) do not touch
the preset sectors.

    picotool load -f -v kicks.bin -o 0x103F2000 && picotool reboot

Old kit files are an 8-byte name followed by the sound parameter bytes in id
order. Files from older firmware can be shorter; missing bytes become 0, as the
old firmware did. Pattern (.PAT), "all" and project files hold sequencer data,
which the module has no use for, and are refused.
"""
import argparse
import os
import struct
import sys
import zlib

SECTOR = 4096
NAME_LEN = 8
SOUND_PARAM_COUNT = 247        # LXR_SOUND_PARAM_COUNT in engine/include/lxr/engine.h
VERSION = 1
SLOTS = 16
FLASH_SIZE = 4 * 1024 * 1024
XIP_BASE = 0x10000000


def slot_offset(slot, flash_size=FLASH_SIZE):
    return flash_size - (SLOTS + 1) * SECTOR + slot * SECTOR


def pack(name, values):
    """Same layout as lxr_preset_pack()."""
    name_bytes = name.encode("ascii", "replace")[:NAME_LEN].ljust(NAME_LEN, b" ")
    body = b"LXRP" + bytes([VERSION, 0]) + struct.pack("<H", len(values)) + name_bytes + bytes(values)
    body += struct.pack("<I", zlib.crc32(body) & 0xFFFFFFFF)
    return body + b"\xff" * (SECTOR - len(body))


def read_kit(path):
    ext = os.path.splitext(path)[1].upper()
    if ext and ext != ".SND":
        raise SystemExit(f"{path}: only kit files (.SND) can be imported; '{ext}' files hold sequencer data")
    data = open(path, "rb").read()
    if len(data) < NAME_LEN:
        raise SystemExit(f"{path}: too short for a kit file ({len(data)} bytes)")
    name = data[:NAME_LEN].split(b"\0")[0].decode("ascii", "replace").rstrip()
    params = list(data[NAME_LEN:NAME_LEN + SOUND_PARAM_COUNT])
    missing = SOUND_PARAM_COUNT - len(params)
    params += [0] * missing
    extra = len(data) - NAME_LEN - SOUND_PARAM_COUNT
    return name, params, missing, max(0, extra)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("kit", help="old LXR kit file (.SND)")
    ap.add_argument("-o", "--output", help="output sector image (default: <kit>.bin)")
    ap.add_argument("--slot", type=int, help=f"preset slot 0..{SLOTS - 1}: print the picotool command")
    ap.add_argument("--name", help="preset name (default: the name stored in the kit, 8 characters)")
    a = ap.parse_args(argv)

    if a.slot is not None and not 0 <= a.slot < SLOTS:
        raise SystemExit(f"--slot must be 0..{SLOTS - 1}")
    name, params, missing, extra = read_kit(a.kit)
    if a.name:
        name = a.name
    out = a.output or os.path.splitext(a.kit)[0] + ".bin"
    open(out, "wb").write(pack(name, params))

    print(f"{out}: preset '{name[:NAME_LEN]}', {SOUND_PARAM_COUNT} parameters")
    if missing:
        print(f"  note: the kit file is from older firmware, {missing} parameter(s) set to 0")
    if extra:
        print(f"  note: {extra} byte(s) after the parameters ignored")
    print("  values outside a parameter's range are clamped when the module loads the preset")
    if a.slot is not None:
        print(f"  write to slot {a.slot} (board running the module firmware):")
        print(f"    picotool load -f -v {out} -o 0x{XIP_BASE + slot_offset(a.slot):08X} && picotool reboot")
    return 0


if __name__ == "__main__":
    sys.exit(main())

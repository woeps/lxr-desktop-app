#!/usr/bin/env python3
"""Renders a test script on the module and compares it with the host's golden WAV
(task 14.1, requirement R5.5).

    host/scripts/pico_render.py voices            # all three: voices cc_sweep dense_retrigger
    host/scripts/pico_render.py voices --port /dev/ttyACM0 --keep pico_voices.wav

It sends `render <script>` over the USB console, reopens the port after the
module restarts into render mode, reads the PCM the module sends
back, writes it as a WAV file and compares it sample by sample with
host/golden/<script>.wav. Pass: bit-exact (design section 10; both builds use
-ffp-contract=off, so the board and the host round every float operation alike). The module restarts after each render.
No extra Python packages are needed.
"""
import argparse
import math
import os
import select
import struct
import sys
import termios
import time
import wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def open_port(path):
    fd = os.open(path, os.O_RDWR | os.O_NOCTTY)
    attrs = termios.tcgetattr(fd)
    attrs[0] = 0                       # iflag: raw
    attrs[1] = 0                       # oflag
    attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
    attrs[3] = 0                       # lflag: no echo, no canonical mode
    attrs[6][termios.VMIN] = 0
    attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    termios.tcflush(fd, termios.TCIOFLUSH)
    return fd


def read_lines(fd, timeout):
    buf = b""
    deadline = time.time() + timeout
    while True:
        r, _, _ = select.select([fd], [], [], max(0.0, deadline - time.time()))
        if not r:
            raise SystemExit("timeout: no data from the module (is the console port right? see --port)")
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            raise SystemExit("the port closed before the render was complete")
        if not chunk:
            continue
        deadline = time.time() + timeout
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            yield line.rstrip(b"\r").decode("ascii", "replace")


def render_on_module(port, script, timeout):
    fd = open_port(port)
    os.write(fd, b"\r\n")
    time.sleep(0.2)
    termios.tcflush(fd, termios.TCIFLUSH)
    os.write(fd, f"render {script}\r\n".encode())
    for line in read_lines(fd, timeout):
        if line.startswith("error:"):
            raise SystemExit(f"module: {line}")
        if line.startswith("render: restarting"):
            break
    try:
        os.close(fd)
    except OSError:
        pass

    # the module restarts into render mode and waits up to 15 s for the port to be opened again
    fd = None
    deadline = time.time() + 15
    time.sleep(1.0)
    while fd is None:
        try:
            fd = open_port(port)
        except OSError:
            if time.time() > deadline:
                raise SystemExit(f"{port} did not come back after the restart")
            time.sleep(0.2)

    blocks, frames = None, bytearray()
    t0 = time.time()
    for line in read_lines(fd, timeout):
        if line.startswith("error:"):
            raise SystemExit(f"module: {line}")
        if line.startswith("render begin "):
            blocks = int(line.split()[3])
            print(f"rendering {script}: {blocks} Blocks ({blocks * 64 / 44100:.1f} s of audio)")
        elif line.startswith("R ") and blocks is not None:
            frames += bytes.fromhex(line[2:])
            got = len(frames) // 256
            if got % 1000 == 0:
                print(f"  {got}/{blocks} Blocks", flush=True)
        elif line.startswith("render aborted"):
            raise SystemExit("module aborted the render")
        elif line.startswith("render end"):
            break
    try:
        os.close(fd)
    except OSError:
        pass
    if blocks is None or len(frames) != blocks * 256:
        raise SystemExit(f"incomplete render: {len(frames) // 256} of {blocks} Blocks")
    print(f"  received in {time.time() - t0:.1f} s")
    return bytes(frames)


def load_wav(path):
    with wave.open(path) as w:
        if w.getnchannels() != 2 or w.getsampwidth() != 2 or w.getframerate() != 44100:
            raise SystemExit(f"{path}: expected 16-bit stereo 44.1 kHz")
        return w.readframes(w.getnframes())


def compare(golden, pico, max_peak=0, max_rms=0.0):
    if len(golden) != len(pico):
        return False, f"length differs: golden {len(golden) // 4} frames, module {len(pico) // 4} frames"
    a = struct.unpack(f"<{len(golden) // 2}h", golden)
    b = struct.unpack(f"<{len(pico) // 2}h", pico)
    peak, at, sq = 0, 0, 0
    for i, (x, y) in enumerate(zip(a, b)):
        d = abs(x - y)
        sq += d * d
        if d > peak:
            peak, at = d, i
    rms = math.sqrt(sq / len(a))
    ok = peak <= max_peak and rms <= max_rms
    return ok, f"peak diff {peak} LSB at frame {at // 2}, rms diff {rms:.4f} LSB (limits {max_peak} / {max_rms})"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("scripts", nargs="+", help="voices, cc_sweep, dense_retrigger")
    ap.add_argument("--port", default="/dev/ttyACM0")
    ap.add_argument("--keep", help="write the module's render to this WAV file (one script only)")
    ap.add_argument("--timeout", type=float, default=10.0, help="seconds without data before giving up")
    a = ap.parse_args()

    failed = 0
    for script in a.scripts:
        golden = load_wav(os.path.join(ROOT, "host", "golden", f"{script}.wav"))
        pico = render_on_module(a.port, script, a.timeout)
        if a.keep:
            with wave.open(a.keep, "wb") as w:
                w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100); w.writeframes(pico)
        ok, msg = compare(golden, pico)
        print(f"{'PASS' if ok else 'FAIL'} {script}: {msg}")
        failed += not ok
        if script != a.scripts[-1]:
            print("waiting for the module to restart ...")
            time.sleep(4)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

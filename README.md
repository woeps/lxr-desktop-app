# LXR drum sound module (RP2350: Waveshare RP2350-Zero or Raspberry Pi Pico 2)

Firmware that turns a Waveshare RP2350-Zero (or a Raspberry Pi Pico 2) into a six-voice MIDI drum
sound module based on the LXR V2 drum engine: three drum voices, snare, hi-hat and cymbal, with a
master FX bus (delay, compressor, distortion, ring modulator). It is played over serial MIDI on a
3.5 mm TRS jack (Type A), sound comes out of a PCM5102A I2S DAC, and sounds are stored in 16 preset
slots in flash. There is no step sequencer and no front panel: sounds are edited over MIDI (the LXR
CC/NRPN map) or with the serial console on the USB port.

This is a port of the LXR V2 desktop firmware (STM32F765). The plan and its status are in
`.kiro/specs/1-move-this-repo-over/` (requirements, design, tasks), the measurements in
[docs/memory-map.md](docs/memory-map.md). The STM32 version is available in the git history.

> **Licence and trademarks:** the firmware source code is free software under the GNU GPL version 3
> ([LICENSE](LICENSE)). The names **"Erica Synths" and "LXR"** and the **LXR hardware** are the property
> of Erica Synths and are **not** covered by this licence. Building and installing your own firmware is
> at your own risk. See [Licence, trademarks and hardware](#licence-trademarks-and-hardware) below and
> [NOTICE.md](NOTICE.md).

## Hardware

| Part | Notes |
|---|---|
| Waveshare RP2350-Zero (or Raspberry Pi Pico 2) | 4 MB flash; the firmware runs from RAM |
| PCM5102A DAC breakout | stereo line out |
| H11L1 optocoupler, 220 Ω, 1 kΩ, 1N4148, 100 nF | MIDI input |
| 3.5 mm TRS socket | MIDI in, Type A (MIDI Association CA-033) |

Wiring (all pins are in `board/rp2350/pins.h`):

| From | To |
|---|---|
| PCM5102A VIN | 5V (or 3V3 if the breakout is 3.3 V only) |
| PCM5102A GND | GND |
| PCM5102A DIN, BCK, LCK | GP9, GP10, GP11 |
| PCM5102A SCK | GND (the DAC makes its clock from BCK) |
| PCM5102A FLT, DEMP, FMT | L (low); XSMT H (high, unmuted). Often solder pads 1 to 4 on the back |
| TRS ring (DIN pin 4) | 220 Ω, then H11L1 pin 1 (anode) |
| TRS tip (DIN pin 5) | H11L1 pin 2 (cathode) |
| TRS sleeve | not connected |
| 1N4148 | across H11L1 pins 1 and 2, band (cathode) to pin 1 |
| H11L1 pin 6 (Vcc) | 3V3, with 100 nF to GND next to the chip |
| H11L1 pin 5 (GND) | GND |
| H11L1 pin 4 (output) | GP1, with 1 kΩ to 3V3 |

GP12 to GP14 and GP6/GP7 are kept free for a later encoder-and-OLED front panel.

The firmware runs the RP2350 at **250 MHz at the stock 1.10 V core voltage** (rated: 150 MHz),
because the full engine needs 1149 µs per 1451 µs audio Block at 150 MHz; at 250 MHz it needs 689 µs.
It passed a 10-minute full-load soak at 41.5 °C. See [docs/memory-map.md](docs/memory-map.md) section 9.
Build with `-DLXR_SYS_CLOCK_KHZ=150000` for the rated clock (heavy patches will then underrun).

## Building

Tools: [CMake](https://cmake.org/download/) 3.21 or newer, [Ninja](https://ninja-build.org/), Python 3,
the [Raspberry Pi Pico SDK](https://github.com/raspberrypi/pico-sdk) 2.1.1 (RP2350 support needs 2.x),
the Arm GNU Toolchain 14.2.Rel1 (`arm-none-eabi-gcc`) and picotool 2.1.1.

The presets in `CMakePresets.json` expect the layout the Raspberry Pi Pico VS Code extension creates:

```
~/.pico-sdk/sdk/2.1.1
~/.pico-sdk/toolchain/14_2_Rel1
~/.pico-sdk/picotool/2.1.1
```

If your tools live elsewhere, override `PICO_SDK_PATH`, `PICO_TOOLCHAIN_PATH` and `picotool_DIR` on
the `cmake` command line.

```sh
cmake --preset release
cmake --build --preset release
```

The result is `build/release/lxr.uf2` (and `lxr.elf`). Build options (`-D...` on the first command):

| Option | Default | Meaning |
|---|---|---|
| `PICO_BOARD` | `waveshare_rp2350_zero` | `pico2` for a Raspberry Pi Pico 2 |
| `LXR_SYS_CLOCK_KHZ` | `250000` | system clock, at most 250000 |
| `LXR_VREG_VOLTAGE` | `VREG_VOLTAGE_1_10` | core voltage, at most `VREG_VOLTAGE_1_20` |
| `LXR_ENABLE_CONSOLE` | `ON` | `OFF`: no console and no USB device (MIDI only; flash with the BOOT button) |
| `LXR_BOOT_DEMO` | `OFF` | play every voice once after boot |

## Flashing

1. Hold the BOOT button while plugging in the USB cable. A drive named `RP2350` appears.
2. Copy `build/release/lxr.uf2` onto that drive. The board restarts into the firmware.

Once the firmware is running, `picotool load -f build/release/lxr.uf2` restarts it into the
bootloader and flashes it without the button. Firmware updates do not touch the saved presets.

## Playing

Each voice listens on its own MIDI channel by default, and the note you play sets its pitch
(C4, note 60, is the voice's tuned pitch):

| Channel | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Voice | drum 1 | drum 2 | drum 3 | snare | cymbal | closed hi-hat | open hi-hat |

The channels, a fixed note per voice (`midi_note1` ... `midi_note7`, 0 = any note) and a global
channel that plays every voice whose note matches (`midi_chan_global`) are settings like any other.
Sound parameters follow the LXR CC/NRPN map. Clock, transport and program change messages are ignored.

## Console

The USB port is a serial device: open it with any terminal (for example `picocom /dev/ttyACM0`)
and type `help`.

| Command | Does |
|---|---|
| `params [voice\|global]` | list parameters with value and range (voices: d1 d2 d3 snare cym hh) |
| `get <param>`, `set <param> <value>` | read or change a parameter (list values also by name) |
| `trigger <voice> [velocity]` | play a voice (d1 d2 d3 snare cym hh hho) |
| `preset list`, `preset load <n>`, `preset save <n> [name]` | 16 preset slots; the last loaded or saved slot is loaded at boot |
| `watch on\|off` | print every parameter change, including those from MIDI |
| `status [reset]` | Block render time, underruns, MIDI errors, clock and temperature |
| `midi` | MIDI input check: bytes, errors, line level, last bytes |
| `bench [fx] [seconds]` | full-load test |
| `render <script>` | render a host test script on the module (used by `host/scripts/pico_render.py`) |

Old LXR kit files (`.SND`) can be turned into presets with `host/scripts/import_kit.py`, which also
prints the `picotool` command that writes them into a slot.

## Tests

The engine, MIDI parser, console and preset code also build for the development machine:

```sh
cmake -S host -B build/host -G Ninja
cmake --build build/host
ctest --test-dir build/host
```

`build/host/lxr_render` renders a MIDI script to a WAV file, `build/host/lxr_console` runs the
console on stdin/stdout. `host/scripts/pico_render.py voices` renders the same script on the module
and compares it with `host/golden/voices.wav`.

## Source layout

| Directory | Contents |
|---|---|
| `engine/` | Drum voices, mixer, FX bus, parameters, presets and the Engine API (`engine/include/lxr/`). No hardware or UI code. |
| `midi/` | MIDI byte parser. |
| `ui/` | User interface layers on top of the Engine API: the serial console. |
| `board/rp2350/` | Pico SDK code: I2S audio, MIDI UART, USB console, flash presets, clocks, pins. |
| `host/` | Host test build, tools and golden audio. |
| `docs/` | Measurements and notes. |
| `cmake/` | SDK import and build checks. |

## Licence, trademarks and hardware


Copyright (C) 2012-2026 Erica Synths.

**Firmware licence.** The firmware, the bootloader and the build system are licensed under the
[GNU General Public License version 3](LICENSE) (GPL-3.0-only), with an additional permission for
the STMicroelectronics libraries and the additional terms in [NOTICE.md](NOTICE.md). In short:

- You may use, study and change the firmware, for example to build your own updates for your device.
- If you share or distribute the firmware, or a modified version of it, including pre-installed on a
  device, you must provide the complete source code under the same licence, and the people you give it
  to may install their own modified versions.
- Modified firmware must be marked as modified (its start-up screen must show this, e.g. with a
  different name or version text) and must not be presented as official Erica Synths firmware.
- The firmware comes **without any warranty**. Building and installing your own or modified firmware is
  entirely at your own risk, and Erica Synths provides no support for it.

**Trademarks.** "Erica Synths", "LXR" and "LXR-02" and the associated logos are trademarks of
Erica Synths. The GPL licence does **not** grant any right to use them. They may not be used for any
product, firmware release, service or commercial activity without prior written permission from
Erica Synths. Truthful references such as "custom firmware for the Erica Synths LXR-02" are fine.

**Hardware.** The LXR hardware (schematics, circuit board layouts, front panel, enclosure and industrial
design) is the intellectual property of Erica Synths and is protected by copyright and design rights.
It is **not** part of this repository and is **not** licensed under the GPL or any other licence. It may
not be copied, manufactured or sold, in whole or in part, without prior written permission from
Erica Synths.

**Third-party code.** The repository includes components from Arm (CMSIS) and Raspberry Pi (Pico SDK, used at build time)
under their own licences. See [NOTICE.md](NOTICE.md#third-party-components).


<sup>
Use code OPENLXR15 on the Erica Synths website for a discount on the LXR (active for 1 week since open-source announcment) :)
</sup>
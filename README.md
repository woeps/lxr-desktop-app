# LXR drum sound module for RP2350 boards

Firmware that turns a Waveshare RP2350-Zero (or a Raspberry Pi Pico 2) into a MIDI drum sound module
built on the LXR V2 drum engine: three drum voices, snare, cymbal and hi-hat (closed and open), with a
master FX bus (distortion, ring modulator, compressor, delay). It is played over serial MIDI on a
3.5 mm TRS jack, sound comes out of a PCM5102A I2S DAC, and 16 sounds can be stored in flash. There
is no sequencer and no front panel: sounds are edited over MIDI (CC and NRPN) or with a serial console
on the USB port.

The firmware is a port of the LXR V2 desktop firmware (STM32F765), which is in the git history.

> **Licence and trademarks:** the firmware source code is free software under the GNU GPL version 3
> ([LICENSE](LICENSE)). The names **"Erica Synths" and "LXR"** and the **LXR hardware** are the property
> of Erica Synths and are **not** covered by this licence. Building and installing your own firmware is
> at your own risk. See [Licence, trademarks and hardware](#licence-trademarks-and-hardware) below and
> [NOTICE.md](NOTICE.md).

## Hardware

| Part | Notes |
|---|---|
| Waveshare RP2350-Zero, or Raspberry Pi Pico 2 | 4 MB flash |
| PCM5102A DAC breakout | stereo line out |
| H11L1 optocoupler, 220 Ω and 1 kΩ resistors, 1N4148 diode, 100 nF capacitor | MIDI input |
| 3.5 mm TRS socket | MIDI in, Type A (ring = DIN pin 4, tip = DIN pin 5) |

Wiring. The pins are defined in `board/rp2350/pins.h`; all of them are on the edge headers of both boards.

| From | To |
|---|---|
| PCM5102A VIN | 5V (or 3V3 if the breakout is 3.3 V only) |
| PCM5102A GND | GND |
| PCM5102A DIN, BCK, LCK | GP9, GP10, GP11 |
| PCM5102A SCK | GND (the DAC makes its own clock from BCK) |
| PCM5102A FLT, DEMP, FMT | low; XSMT high (unmuted). On many breakouts these are solder pads 1 to 4 on the back |
| TRS ring | 220 Ω, then H11L1 pin 1 (anode) |
| TRS tip | H11L1 pin 2 (cathode) |
| TRS sleeve | not connected |
| 1N4148 | across H11L1 pins 1 and 2, band (cathode) to pin 1 |
| H11L1 pin 6 (Vcc) | 3V3, with 100 nF to GND next to the chip |
| H11L1 pin 5 (GND) | GND |
| H11L1 pin 4 (output) | GP1, with 1 kΩ to 3V3 |

If no notes arrive, the cable or adapter may be Type B (tip and ring swapped). That does no harm;
swap the tip and ring wires. GP6, GP7 and GP12 to GP14 are unused.

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
| `LXR_SYS_CLOCK_KHZ` | `250000` | system clock in kHz, at most 250000 |
| `LXR_VREG_VOLTAGE` | `VREG_VOLTAGE_1_10` | core voltage, at most `VREG_VOLTAGE_1_20` |
| `LXR_ENABLE_CONSOLE` | `ON` | `OFF`: no console and no USB device; the module plays from MIDI only and is flashed with the BOOT button |
| `LXR_BOOT_DEMO` | `OFF` | play every voice once after boot |

## Flashing

1. Hold the BOOT button while plugging in the USB cable. A drive named `RP2350` appears.
2. Copy `build/release/lxr.uf2` onto that drive. The board restarts into the firmware.

Once the firmware is running, `picotool load -f build/release/lxr.uf2` restarts it into the
bootloader and flashes it without the button. Firmware updates do not touch the saved sounds.

## Playing

Each voice listens on its own MIDI channel, and the note you play sets its pitch (C4, note 60, is the
voice's tuned pitch):

| Channel | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Voice | drum 1 | drum 2 | drum 3 | snare | cymbal | closed hi-hat | open hi-hat |

These are settings like any other and are stored with the presets: the channel of each voice
(`midi_chan_1` to `midi_chan_7`), a fixed trigger note per voice (`midi_note1` to `midi_note7`,
0 = any note), and a global channel (`midi_chan_global`, 0 = off) on which a note plays every voice
whose trigger note matches it.

Sound parameters follow the LXR CC/NRPN map: parameters 0 to 126 are CC 1 to 127 (CC number =
parameter number + 1), parameters from 128 up are NRPN (CC 99 = 0, CC 98 = parameter number - 128,
then the value on CC 6). Velocity can be routed to a parameter per voice. Note off, clock, transport,
program change and system exclusive messages are ignored.

## Console

The USB port is a serial device: open it with any terminal (for example `picocom /dev/ttyACM0`) and
type `help`.

| Command | Does |
|---|---|
| `params [voice\|global]` | list parameters with value and range (voices: d1 d2 d3 snare cym hh) |
| `get <param>`, `set <param> <value>` | read or change a parameter (list values also by name, e.g. `set filter_type_1 hp`) |
| `trigger <voice> [velocity]` | play a voice (d1 d2 d3 snare cym hh hho) |
| `preset list`, `preset load <n>`, `preset save <n> [name]` | 16 slots with 8-character names; the slot last loaded or saved is loaded at power-up, an empty or damaged slot gives the factory sound |
| `watch on\|off` | print every parameter change, including those from MIDI |
| `status [reset]` | CPU load, Block render time (worst, average, last second), output peak, underruns, MIDI errors, clock and temperature |
| `midi [reset]` | MIDI input check: bytes, errors, input line level, last bytes, note latency |
| `bench [fx] [seconds]` | full-load test: all voices every 46 ms, drum 1 through the chosen effect |
| `render <script>` | render a test script on the module and send the audio to the computer (see Tests) |

Old LXR kit files (`.SND`) can be turned into presets with `host/scripts/import_kit.py`, which also
prints the `picotool` command that writes one into a slot.

## Performance

Measured on a Waveshare RP2350-Zero:

| | |
|---|---|
| Clock | 250 MHz at the stock 1.10 V core voltage. The RP2350 is rated for 150 MHz, where the engine needs up to 1149 µs of the 1451 µs available per audio Block, which leaves too little headroom; 200 MHz (860 µs) would also do. |
| Audio core load | worst 660 µs, average 645 µs per 1451 µs Block under full load (all voices every 46 ms with the compressor) |
| Soak | 10 minutes of full load and 10 minutes of dense MIDI: no underruns, at most 41.5 °C |
| Note latency | last MIDI input edge to the note in the output buffer: 2.2 ms at most, 1.4 ms on average |
| Saving a preset | 39 ms flash write; audio and MIDI keep running |
| Boot | ready to play less than 0.3 s after power-up |
| RAM | 365 KiB of 512 KiB in use; the firmware runs from RAM |

Build with `-DLXR_SYS_CLOCK_KHZ=150000` for the rated clock; heavy sounds will then drop out.

## How it works

The RP2350's two cores split the work. Core 1 is the audio core: before each 64-frame Block (1.45 ms
at 44.1 kHz) it reads the MIDI bytes that arrived, which DMA collects from UART0 with no CPU work,
and then renders the Block into one half of a double buffer that DMA streams to a PIO program
generating I2S. Core 0 runs the USB console and writes presets to flash; because the firmware runs
from RAM, a flash write on core 0 never stops the audio. Changes from the console travel to the audio
core through a lock-free queue.

The sound engine (`engine/`) has no hardware or user-interface code. Everything else reaches it
through the Engine API in `engine/include/lxr/`, so a different user interface, such as a front
panel, is a new module in `ui/` and does not change the engine. The engine uses single-precision
floating point only; the build fails if any double-precision code ends up in it.

## Tests

The engine, MIDI parser, console and preset code also build for the development machine:

```sh
cmake -S host -B build/host -G Ninja
cmake --build build/host
ctest --test-dir build/host
```

`build/host/lxr_render <script> <seconds> <out.wav>` renders a MIDI script (`host/scripts/*.txt`) to a
WAV file, and `build/host/lxr_console` runs the console on stdin/stdout. With the module connected,
`host/scripts/pico_render.py voices cc_sweep dense_retrigger` renders the same scripts on the module
and compares them with `host/golden/`: the module and the computer produce identical audio, sample
for sample.

## Source layout

| Directory | Contents |
|---|---|
| `engine/` | Drum voices, mixer, FX bus, parameters, presets and the Engine API (`engine/include/lxr/`) |
| `midi/` | MIDI byte parser |
| `ui/` | User interfaces on top of the Engine API: the serial console |
| `board/rp2350/` | Pico SDK code: I2S audio, MIDI input, USB console, preset flash, clocks, pins |
| `host/` | Test build for the development machine, tools and reference audio |
| `docs/` | Measurement notes |
| `cmake/` | SDK import and build checks |

## Licence, trademarks and hardware

Copyright (C) 2012-2026 Erica Synths.

**Firmware licence.** The firmware and the build system are licensed under the
[GNU General Public License version 3](LICENSE) (GPL-3.0-only), with the additional permission and
the additional terms in [NOTICE.md](NOTICE.md). In short:

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

**Third-party code.** The firmware is built with components from Arm (CMSIS) and Raspberry Pi (Pico SDK)
under their own licences. See [NOTICE.md](NOTICE.md#third-party-components).


<sup>
Use code OPENLXR15 on the Erica Synths website for a discount on the LXR (active for 1 week since open-source announcment) :)
</sup>
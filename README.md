# LXR drum sound module (RP2350: Waveshare RP2350-Zero or Raspberry Pi Pico 2)

Firmware that turns a Waveshare RP2350-Zero (or a Raspberry Pi Pico 2) into a six-voice MIDI drum sound module based on the LXR V2
drum engine: three drum voices, snare, hi-hat and cymbal, with a master FX bus (delay, reverb,
compressor, distortion, ring modulator). It is played over serial MIDI on a 3.5 mm TRS jack (Type A) and sounds come out of a
PCM5102A I2S DAC. There is no step sequencer.

> **Port in progress.** This tree is being moved from the LXR V2 desktop firmware (STM32F765) to the
> Pico 2. The plan is in `.kiro/specs/1-move-this-repo-over/` (requirements, design, tasks), and the
> current measurements are in [docs/memory-map.md](docs/memory-map.md). The firmware skeleton builds, but
> it does not make sound yet. The STM32 version is available in the git history.

> **Licence and trademarks:** the firmware source code is free software under the GNU GPL version 3
> ([LICENSE](LICENSE)). The names **"Erica Synths" and "LXR"** and the **LXR hardware** are the property
> of Erica Synths and are **not** covered by this licence. Building and installing your own firmware is
> at your own risk. See [Licence, trademarks and hardware](#licence-trademarks-and-hardware) below and
> [NOTICE.md](NOTICE.md).

## Building

Tools: [CMake](https://cmake.org/download/) 3.21 or newer, [Ninja](https://ninja-build.org/), the
[Raspberry Pi Pico SDK](https://github.com/raspberrypi/pico-sdk) 2.1.1 (RP2350 support needs 2.x), the
Arm GNU Toolchain 14.2.Rel1 (`arm-none-eabi-gcc`) and picotool 2.1.1.

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

The result is `build/release/lxr.uf2` (and `lxr.elf`).

## Flashing

1. Hold the BOOT button while plugging in the USB cable. A drive named `RP2350` appears.
   Once the module firmware is running, `picotool load -f build/release/lxr.uf2` reboots it into
   BOOTSEL and flashes it without the button.
2. Copy `build/release/lxr.uf2` onto that drive. The board reboots into the firmware.

The USB port carries power, flashing and the serial console (a USB serial device; open it with any
terminal, e.g. `screen /dev/ttyACM0` or `picocom /dev/ttyACM0`, and type `help`). The module has no
USB MIDI; MIDI comes in on the TRS MIDI input (H11L1 optocoupler into GP1).

The firmware runs the RP2350 at 250 MHz (rated: 150 MHz) at the stock 1.10 V core voltage, because
the full drum engine needs it; see [docs/memory-map.md](docs/memory-map.md) section 9. Build with
`-DLXR_SYS_CLOCK_KHZ=150000` for the rated clock (some heavy patches will then underrun).

The default board is the Waveshare RP2350-Zero. For a Pico 2, configure with
`cmake --preset release -DPICO_BOARD=pico2`.

## Source layout

| Directory | Contents |
|---|---|
| `engine/` | Drum voices, mixer, FX bus, parameters and presets. No hardware or UI code. |
| `midi/` | MIDI byte parser and the CC/NRPN parameter map. |
| `ui/` | User interface layers on top of the engine (a serial console is planned first). |
| `board/rp2350/` | Pico SDK code: audio, UARTs, flash, cores, pin assignments. |
| `host/` | Host-side test build that runs the engine without hardware. |
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
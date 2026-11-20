# RP2350 memory map and platform checks

Results of task 1 (feasibility spike) of `.kiro/specs/1-move-this-repo-over/`. Updated again by tasks 9.4, 9.5 and 9.7 with real link and timing numbers.

## 1. Toolchain

| Tool | Version found | Where |
|---|---|---|
| Arm GNU Toolchain | 14.2.Rel1 (also 13.2.Rel1) | `~/.pico-sdk/toolchain/14_2_Rel1/bin` (not on `PATH` by default) |
| Pico SDK | 2.1.1 (also 1.5.1, which has no RP2350 support and must not be used) | `~/.pico-sdk/sdk/2.1.1` |
| picotool | 2.1.1 (and 2.2.0-a4 on `PATH`) | `~/.pico-sdk/picotool/` |
| CMake / Ninja | 3.28.3 / on `PATH` | system |

Build flags needed (found while compiling the DSP code for the Cortex-M33):
- `-mcpu=cortex-m33 -mthumb -mfloat-abi=hard -mfpu=fpv5-sp-d16` (the SDK sets these for board `pico2`).
- **`-mfp16-format=ieee` must be added.** Without it GCC rejects `__fp16` (`unknown type name '__fp16'`), which the FX bus and the reverb use. With it the half-precision accesses compile to `vcvtb.f16`/`vcvtt.f16` hardware conversions.
- Intrinsics used by the DSP code (`__QADD16`, `__QSUB16`, `__PKHBT`, `__SSAT`, ...) are provided by CMSIS `cmsis_gcc.h` for the M33 DSP extension, so `core_cm33.h` from the Pico SDK's CMSIS stub works unchanged.

## 2. Image size of the engine code (task 1.1)

Compiled with `arm-none-eabi-gcc 14.2.1 -O3 -fno-thread-jumps -ffunction-sections -fdata-sections` for Cortex-M33, using stubs for `stm32f7xx.h`/HAL types. Objects: all of `Core/Src/Soundengine/DSPAudio/` (including `FX/` and `FX/VerbTools/`), `FxBus.c`, `FIFO.c`, `MIDI/ParameterArray.c`, `MIDI/MidiMessages.c`, `Parameters.c`, `Preset/initKit.c`.

| Section | Bytes |
|---|---|
| text (code + read-only data) | 147,988 |
| data (initialised, includes the 64 KB FX buffer) | 69,557 |
| bss | 2,062 |
| **Total** | **219,607 (about 215 KB)** |

Largest contributors:

| Object | text | data | bss |
|---|---|---|---|
| `wavetable.o` | 75,778 | 0 | 0 |
| `transientTables.o` | 26,736 | 0 | 0 |
| `Distortion.o` | 7,352 | 0 | 0 |
| `Delay.o` | 4,344 | 0 | 0 |
| `Oscillator.o` | 4,060 | 0 | 8 |
| `mixer.o` | 3,860 | 70 | 12 |
| `ResonantFilter.o` | 2,968 | 0 | 0 |
| `ParameterArray.o` | 2,748 | 0 | 1,984 |
| `DrumVoice.o` | 1,780 | 2,112 | 8 |
| `FxRamBuffer.o` | 0 | 65,536 | 0 |

Findings:
- **`Samples.c` contributes 0 bytes.** Its roughly 200 KB of source is one commented-out block (lines 32 to 2083). The design's "about 200 KB of sample data" assumption was wrong: there is no built-in sample data in the image, and the requirement R5.4 (samples read in place from flash) has nothing to apply to. The wavetables (76 KB) and transient tables (27 KB) are the real read-only data.
- `FxRamBuffer.o` is 64 KB because `FX_BUFFER` is a `__fp16[32768]` placed in `.dtcm` with `INDTCMZ`; it counts as initialised data in this build because of the section attribute. On the Pico it becomes ordinary zeroed RAM (the attribute macros will be redefined to nothing).
- Not yet included: the ported MIDI parser, console, engine API, preset code, board drivers and SDK runtime. Estimate for these: 30 to 40 KB.

## 3. Decision: copy-to-RAM (task 1.2)

Estimated RAM with the whole image copied to RAM:

| Item | KB |
|---|---|
| Engine objects above (code, tables, FX buffer, state) | 215 |
| Ported MIDI, console, API, preset, board and SDK code (estimate) | 40 |
| Stacks, DMA buffers, FIFOs (design 6.2) | 11 |
| **Total** | **about 266** |

The RP2350 has 520 KB of SRAM, so about 250 KB stays free. **Decision: use `pico_set_binary_type(lxr copy_to_ram)`**, as design section 6.2 proposed. This gives deterministic timing for the audio core and makes glitch-free preset saves possible (design 7.3). Task 9.7 re-checks this against the real link map.

## 4. Double-precision findings (for R5.1)

Compiling the same objects with `-Wdouble-promotion` reported about 108 places where a `float` is silently promoted to `double`, mostly in `Distortion.c` (32), `Delay.c` (14), `Compressor.c` (12), `Reverb.c` (10), `ResonantFilter.c` (9) and `1PoleLp.c` (7). On the Cortex-M33 each of these runs as slow software double math. **Fixed in task 8.4:** all `double` variables and libm calls in the engine are now single precision. The Pico build fails if the engine library references any software double helper (`cmake/check_no_double.cmake`).

## 5. Clock, voltage and temperature limits (task 1.3)

- The RP2350 is rated for a **150 MHz** system clock. Anything above is outside the official rating.
- Pico SDK 2.1.1 `hardware/vreg.h`: default core voltage 1.10 V (`VREG_VOLTAGE_DEFAULT`), highest standard setting 1.30 V (`VREG_VOLTAGE_MAX`). Steps available between: 1.15, 1.20, 1.25, 1.30 V. Settings above 1.30 V need an explicit unlock call and are **not used**.
- Community reports (for example the [Pimoroni overclocking article](https://learn-new.pimoroni.com/article/overclocking-the-pico-2)) say Pico boards run well above their rating with a raised core voltage. These are not guarantees.
- I could not fetch the datasheet table with the absolute voltage limit and the junction temperature limit in this session, so those two numbers are **not yet confirmed from the datasheet**. The spec's limits stay as they are and stricter than the SDK maximum: **at most 250 MHz, at most 1.20 V, and the on-chip temperature sensor must stay below 70 °C** (a conservative bench limit of mine, not a datasheet figure). Task 9.5 must read the RP2350 datasheet's electrical characteristics before overclocking and lower the limits if they are tighter.

## 6. First real link (tasks 9.1 and 9.2)

Arm GNU 14.2.Rel1, Pico SDK 2.1.1, board `pico2`, `copy_to_ram`, release build:

| Section | Address | Size |
|---|---|---|
| `.text` (code and read-only data, copied to RAM at boot) | `0x20000110` | 60,572 B |
| `.data` (tables and initialised data) | `0x2000EDB0` | 116,012 B |
| `.bss` (FX buffer, voice state, queues) | `0x2002B2C0` | 75,748 B |
| `.heap` | `0x2003DAA4` | 2,048 B |
| Core 1 stack (SCRATCH_X) | `0x20080000` | 2,048 B |
| Core 0 stack (SCRATCH_Y) | `0x20081000` | 2,048 B |

Main SRAM in use: `0x20000000` to `0x2003DAA4`, **252 KB of 512 KB, about 260 KB free**. The copy-to-RAM decision of section 3 holds. The image in flash is 177 KB (`lxr.uf2` 347 KB).

The stacks are the SDK default 2 KB each. The audio path's largest frame is the mixer (about 400 B of local buffers). The console's largest is a formatted line (128 B plus the SDK printf). Task 9.3 checks this on hardware; if a stack turns out to be short, the fix is to move large locals to statics, not to grow the stack into the scratch banks.

## 7. Pending measurements

- Block render time at 150 MHz: task 9.4.
- Overclock steps: task 9.5.

## 8. USB console and RP2350-Zero (task 9.8)

Board `waveshare_rp2350_zero` (4 MB flash, same RP2350A as the Pico 2), console on USB CDC (`stdio_usb`, TinyUSB CDC only): text + data 191,856 B, bss 80,640 B. The USB stack adds about 15 KB of code and 5 KB of RAM. Main SRAM in use is about 267 KB of 512 KB.

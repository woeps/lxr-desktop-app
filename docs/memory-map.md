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

## 9. Hardware measurements

| Date | Board | Clock / Vcore | Load | worst_block_us | avg_block_us | underruns | Notes |
|---|---|---|---|---|---|---|---|
| 2026-11-21 | RP2350-Zero | 150 MHz / 1.10 V | snare triggered from the console, no FX | 1038 | not yet measured | 0 | first run (task 9.3); over the 1000 us budget, under the 1451 us Block period |
| 2026-11-21 | RP2350-Zero | 150 MHz / 1.10 V | `bench del 10` | 1142 | 1097 | 0 | FAIL (budget 1000 us), 37.9 C |
| 2026-11-21 | RP2350-Zero | 150 MHz / 1.10 V | `bench drv 10` | 1102 | 1077 | 0 | FAIL (budget 1000 us), 38.3 C |
| 2026-11-21 | RP2350-Zero | 150 MHz / 1.10 V | `bench cmp 10` | 1149 | 1123 | 0 | FAIL (budget 1000 us), 38.3 C |
| 2026-11-21 | RP2350-Zero | 200 MHz / 1.10 V | `bench del 10` | 857 | 822 | 0 | pass, 38.8 C |
| 2026-11-21 | RP2350-Zero | 200 MHz / 1.10 V | `bench drv 10` | 826 | 807 | 0 | pass, 39.1 C |
| 2026-11-21 | RP2350-Zero | 200 MHz / 1.10 V | `bench cmp 10` | 860 | 841 | 0 | pass, 39.1 C |
| 2026-11-21 | RP2350-Zero | 250 MHz / 1.10 V | `bench del 10` | 685 | 658 | 0 | pass, 39.7 C |
| 2026-11-21 | RP2350-Zero | 250 MHz / 1.10 V | `bench drv 10` | 661 | 645 | 0 | pass, 39.9 C |
| 2026-11-21 | RP2350-Zero | 250 MHz / 1.10 V | `bench cmp 10` | 689 | 673 | 0 | pass, 40.3 C |

Findings (task 9.4 / 9.5):
- At the rated 150 MHz the full load needs up to 1149 us per Block (79% of the 1451 us Block period). That misses the 1000 us budget, so the overclock step of design section 9 applies.
- Render time scales almost exactly with the clock (1149 us x 150/200 = 862 us, measured 860 us), so the render is CPU-bound, not limited by memory access.
- The compressor is the heaviest effect, the distortion the lightest.
- **200 MHz at the stock 1.10 V is the lowest step that passes: 860 us worst, 59% of the Block period.** 250 MHz gives 689 us.
- The core voltage stays at the default 1.10 V, so the voltage limit is not touched. Die temperature stays below 41 C at all steps (limit 70 C).
- 10-minute soak at 250 MHz / 1.10 V (`bench cmp 600`, 2026-11-21): worst 689 us, avg 673 us, 0 underruns, die temperature rising from 41.0 to 41.5 C and flat after 3 minutes. Pass.
- **Decision (user, 2026-11-21): 250 MHz at 1.10 V is the default clock.** It passed the soak and leaves more headroom (47% of the Block period) than 200 MHz (59%), which was the lowest passing step but was not soak-tested. This departs from design section 9's "lowest passing step" rule by the user's choice.

## 7. Pending measurements

- Block render time at 150 MHz: task 9.4.
- Overclock steps: task 9.5.

## 8. USB console and RP2350-Zero (task 9.8)

Board `waveshare_rp2350_zero` (4 MB flash, same RP2350A as the Pico 2), console on USB CDC (`stdio_usb`, TinyUSB CDC only): text + data 191,856 B, bss 80,640 B. The USB stack adds about 15 KB of code and 5 KB of RAM. Main SRAM in use is about 267 KB of 512 KB.

## 10. Board against host (task 14.1)

2026-11-21, RP2350-Zero at 250 MHz, engine built with `-ffp-contract=off`: `host/scripts/pico_render.py`
rendered voices (6202 Blocks), cc_sweep (5857) and dense_retrigger (7235) on the module, and all three
match the host's golden WAVs bit for bit. Before the change the only differences were the M33's automatic
FMA contraction (up to 5 LSB peak, 0.23 LSB RMS), and before that undefined float-to-unsigned casts in
the FM oscillators (fixed in commit cce676c).

Cost of `-ffp-contract=off`: none measurable. `bench cmp 10` at 250 MHz, 2026-11-21: worst_block_us 660,
avg_block_us 645, underruns 0, 40.0 C (before: 689 / 673). The Cortex-M33 FPU takes 3 cycles for VFMA and
1 each for VMUL and VADD, which fits the small gain; other changes since the earlier run (FM cast helper,
wavetable index wrap, MIDI parsing on the audio core) also contribute, so the gain is not attributed to one change.
The audio core uses 45% of the 1451 us Block period in the worst measured case.

## 11. Current link (2026-11-21, task 14.4)

Release build, board `waveshare_rp2350_zero`, 250 MHz, `copy_to_ram`:

| Section | Bytes |
|---|---|
| `.text` | 86,564 |
| `.data` (tables, compiled-in render scripts, initialised data) | 195,520 |
| `.bss` (FX buffer, voice state, queues, rings) | 91,304 |
| `.heap` | 2,048 |
| Core 0 / core 1 stacks (SCRATCH_X/Y, outside main SRAM) | 2,048 each |

Main SRAM in use: `0x20000000` to `0x2005B4A8`, **373,928 B (365 KiB) of 512 KiB, 147 KiB free** (R5.2). The image in
flash ends at `0x45018` (276 KB); the preset region starts at `0x3EF000`.

The growth since section 8 (267 KB) is mostly the render scripts for the `render` command: the
largest single object is `ev_dense_retrigger` (66 KB), ahead of the FX buffer (64 KB). The no-console
build (`-DLXR_ENABLE_CONSOLE=OFF`) leaves them out: 176,532 B text+data, 87,776 B bss. If RAM gets
tight later, these tables are the first thing to move to flash (they are only read by the render mode,
which does not run audio).

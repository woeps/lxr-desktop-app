# Acceptance record: LXR sound module on RP2350 (task 14.4)

Every acceptance criterion of `.kiro/specs/1-move-this-repo-over/requirements.md`, checked on
2026-11-21 against branch `rp2350`. Hardware: Waveshare RP2350-Zero at 250 MHz / 1.10 V, PCM5102A,
H11L1 MIDI input on a 3.5 mm TRS jack (Type A).

Status: **pass** (met, with evidence), **pass, deviation** (met in substance, differs from the
wording; the deviation is stated), **partial** (part of it is not shown), **not measured**,
**n/a** (nothing to apply it to).

Host tests: `cmake -S host -B build/host -G Ninja && cmake --build build/host && ctest --test-dir build/host`
(12 suites, all pass).

## R1 Build and run on the RP2350

| # | Status | Evidence |
|---|---|---|
| 1.1 | pass | `cmake --preset release` builds `lxr.uf2`/`lxr.elf` for `waveshare_rp2350_zero`; `-DPICO_BOARD=pico2` builds for the Pico 2. The link map contains no STM32 object (`grep -c stm32 build/release/lxr.elf.map` = 0). |
| 1.2 | not measured | Boot was not timed. The boot path has one fixed wait (10 ms for the core regulator) and no wait for USB; the boot demo started playing right after power-up on hardware (task 9.3). |
| 1.3 | pass | Runs on a stock RP2350-Zero with only the PCM5102A and the MIDI input circuit (tasks 9.3, 10.4). The Pico 2 build compiles but was not run on a Pico 2. |
| 1.4 | pass | No STM32 file in the tree (`git ls-files` check for `Drivers/`, `Middlewares/`, `FATFS/`, `USB_DEVICE_MIDI/`, linker script, startup, HAL-MSP, image tools: none). Git history keeps them (commit `a43cd4f` and earlier). |
| 1.5 | pass | Every source carries `SPDX-License-Identifier: GPL-3.0-only` except `cmake/pico_sdk_import.cmake`, which is the SDK's own BSD-3-Clause file and is listed in `NOTICE.md`. Carried-over files keep their original headers. |

## R2 Sequencer removal

| # | Status | Evidence |
|---|---|---|
| 2.1 | pass | Sequencer, Euclid, clock sync, pattern storage and their UI are deleted (task 3); `engine/` and `midi/` contain no sequencer code. |
| 2.2 | pass | Clock, start, stop, continue, song position and MTC are consumed and dropped (`midi/src/MIDI/MidiParser.c`). |
| 2.3 | pass | Host test `midi_parser`: real-time bytes inside a note message and system messages change nothing. Not separately tried with a clock-sending sequencer on hardware. |
| 2.4 | pass | Presets hold the 247 sound parameter bytes plus the MIDI settings (`engine/include/lxr/preset.h`). `host/scripts/import_kit.py` refuses pattern, all and project files (CTest `import_kit`). |
| 2.5 | pass | Sequencer-only parameters are not in the parameter table (`docs/removed-params.md`, CTest `param_table`). |
| 2.6 | pass | Per-step modulation went with the sequencer. MIDI velocity modulation works, including routing to a target (CTest `engine_api`, fixed in commit `03818cd`). |

## R3 Audio output

| # | Status | Evidence |
|---|---|---|
| 3.1 | pass | 44.1 kHz, 16-bit stereo. |
| 3.2 | partial | `bench cmp 600` (all seven slots every 46 ms, compressor, 10 minutes): 0 underruns, 41.5 C (task 9.5). Dense MIDI pattern at 250 bpm from a sequencer: 0 underruns, worst Block 630 us, but it ran about 7 minutes (289,114 Blocks), not 10. The 10-minute run was synthetic and before MIDI moved to the audio core. |
| 3.3 | pass | One Block per DMA buffer completion (`board/rp2350/audio_i2s.c`). |
| 3.4 | pass | PIO I2S to a PCM5102A, SCK tied low; pins GP9/10/11 in the design's pin table and `board/rp2350/pins.h`. No audible clock jitter at 250 MHz (task 9.6). |
| 3.5 | pass | `lxr_get_stats()`: `recent_worst_block_us` (rolling one-second window), `worst_block_us` and `avg_block_us` since the last reset, `cpu_percent`; shown by `status`. |

## R4 MIDI input

| # | Status | Evidence |
|---|---|---|
| 4.1 | pass | 31250 baud 8N1 on UART0 RX (GP1), H11L1, TRS Type A; notes play on hardware (task 10.4). |
| 4.2 | pass | No USB MIDI class linked (`midid_*` absent); USB carries the console and the picotool reset interface (task 10.3). |
| 4.3 | pass | Notes trigger the voice of their channel with their velocity, using the original trigger code (hardware, CTest `midi_parser`). |
| 4.4 | pass | The CC/NRPN handler is the original code, moved to `engine/src/param_apply.c`. The `cc_sweep` script (CC filter sweep, NRPN FX sweep) runs through the parser on the board and matches the host bit for bit (task 14.1). |
| 4.5 | pass | Parameter ids are unchanged, so CC and NRPN numbers are unchanged (`docs/removed-params.md`). |
| 4.6 | not measured | No scope or logic analyser was available (task 10.5, deferred by the user). By construction: the audio core parses MIDI right before each Block, so a complete message waits at most one Block (1.45 ms) before it is rendered into the output buffer. |
| 4.7 | pass, deviation | Framing, parity, break and overrun flags of each byte are kept by the receive DMA and counted in `midi_errors`; the parser drops the partial message and resyncs (CTest `midi_parser`). On hardware, unplugging the cable while playing left `midi_errors` at 0 (the line just goes idle) and notes resumed; a corrupted byte was not injected on hardware. An overflow of the 512-entry DMA ring is not detected; it would need the audio core to stall for 164 ms. |

## R5 Engine on the RP2350

| # | Status | Evidence |
|---|---|---|
| 5.1 | pass | All engine math is single precision; `-Werror=double-promotion`, and `cmake/check_no_double.cmake` fails the build if the engine links any double helper or double libm function. |
| 5.2 | pass | 365 KiB of 512 KiB SRAM in use, 147 KiB free, including the 64 KB FX buffer (`docs/memory-map.md` section 11). |
| 5.3 | pass, deviation | 150 MHz missed the budget (1149 us); 200 MHz passed (860 us); 250 MHz passed (689 us) and its 10-minute soak. The user chose 250 MHz instead of the lowest passing step; voltage stays at 1.10 V. No core split or reduction was needed. |
| 5.4 | n/a | `Samples.c` is one commented-out block and adds 0 bytes; there is no built-in sample data (task 1). |
| 5.5 | pass | `host/lxr_render` renders MIDI scripts to WAV; `host/scripts/pico_render.py` renders the same scripts on the board. All three (voices, cc_sweep, dense_retrigger) match bit for bit; the design's tolerance is now exact (both builds use `-ffp-contract=off`). |
| 5.6 | pass | User-sample SD memory removed; decision recorded in the design (section 2). |

## R6 UI abstracted from the Engine

| # | Status | Evidence |
|---|---|---|
| 6.1 | pass | `check_engine_deps` (part of every build) fails on any UI or hardware include in `engine/` or `midi/`; the engine calls no UI function. |
| 6.2 | pass, deviation | The API is `engine/include/lxr/engine.h` with `param_info.h` (included by it) and `preset.h`: trigger, get/set by id, enumerate with name, range, default and list names, preset load/save/name/boot, output level (`out_peak`), CPU load (`cpu_percent`, Block times), change callback. Deviations: presets are in a second header, and parameters have no **unit** field, because the original menu data has no units to carry over. |
| 6.3 | pass | The UI layer uses only the Engine API. `-DLXR_ENABLE_CONSOLE=OFF` links no console or USB code, boots and plays from MIDI on hardware (task 14.3). |
| 6.4 | pass | MIDI changes reach every UI through the callback, delivered on the control core by `ui_poll_all()` (CTest `engine_api`, `console`). |
| 6.5 | pass | `engine/src/param_table.c`, generated from the old menu data, read through `lxr_param_info()` / `lxr_param_find()`. |
| 6.6 | pass | Engine, MIDI parser, UI registry and console build and run in the host build. |
| 6.7 | pass | A UI is a `ui_t` (`ui/ui_iface.h`), up to four at once; the console is one, tested with two stub UIs in CTest `engine_api`. |
| 6.8 | pass | `menu.c`, `buttonHandler.c`, `ledHandler.c`, `lcd.c`, `frontPanelParser.c` are deleted, not ported; the console is new code on the Engine API. |

## R7 Minimal UI: none plus a serial console

| # | Status | Evidence |
|---|---|---|
| 7.1 | pass | No front-panel hardware; all sound parameters are reachable by CC/NRPN. |
| 7.2 | pass | USB CDC console on the board's USB port, used throughout the hardware tests. |
| 7.3 | pass | `help`, `params`, `get`, `set`, `trigger`, `preset load/save/list`, `status` (CPU, worst Block, MIDI errors, underruns), plus `watch`, `midi`, `bench`, `render` (CTest `console`). |
| 7.4 | pass | Commands call only the Engine API; bad names, values, voices, slots and lengths print an error and change nothing (CTest `console`). |
| 7.5 | pass | `watch on` prints changes from the callback, including those from MIDI (CTest `console`). |
| 7.6 | pass | `build/host/lxr_console` runs the console on stdin/stdout. |
| 7.7 | pass | The console runs on the control core and never blocks (output is dropped when the USB buffer is full); MIDI is parsed on the audio core. No underruns or MIDI errors in any console-driven hardware test. |
| 7.8 | pass | A new UI is another `ui_t`; neither the engine nor the console would change. Not built in this spec. |

## R8 Preset storage

| # | Status | Evidence |
|---|---|---|
| 8.1 | pass | 16 slots plus a globals sector in the last 68 KB of flash (`board/rp2350/preset_flash.c`). |
| 8.2 | pass | Audio runs from RAM on core 1 during the 39 ms flash write; a ringing cymbal and a live MIDI pattern continued through repeated saves (task 12.3, after MIDI moved to the audio core). |
| 8.3 | pass | Power cycle restores the last slot (task 12.5); blank or corrupt slots fall back to the factory sound and keep the MIDI settings (CTest `preset`). The erased-flash case was tested on the host only. |
| 8.4 | pass | 16 slots. |

## Open points

- **R1.2:** time the boot (power-up to first sound) once.
- **R3.2:** run a full 10-minute MIDI soak with the current firmware (the 7-minute run had no underruns).
- **R4.6:** measure note-to-audio latency with a scope or logic analyser.
- **R4.7:** inject a corrupted byte on hardware to see `midi_errors` count it.

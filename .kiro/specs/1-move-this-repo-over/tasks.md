# Tasks: LXR sound module on RP2350 (Waveshare RP2350-Zero)

Implements `requirements.md` and `design.md` in this directory. Tasks are ordered; each task lists the requirements it satisfies. Hardware tasks need the RP2350-Zero (or a Pico 2), a PCM5102A module and the 6N138 MIDI input circuit. The console runs over the board's USB port. Host tasks need only a C compiler and CMake.

Paths are relative to `/home/chris/Projects/lxr-desktop-app`.

- [x] 1. Feasibility spike: image size and toolchain check (R1, R5)
  - [x] 1.1 Compile the DSP sources under `Core/Src/Soundengine/DSPAudio/` and `Core/Src/Parameters.c` with `arm-none-eabi-gcc -mcpu=cortex-m33 -mfloat-abi=hard -mfpu=fpv5-sp-d16 -O3`, stubbing the removed headers, and record `.text`, `.rodata` and `.bss` sizes per object in `docs/memory-map.md`. This needs no Pico SDK.
  - [x] 1.2 Decide copy-to-RAM versus XIP from the totals (design 6.2) and write the decision, with the numbers, into `docs/memory-map.md`.
  - [x] 1.3 Check the SDK voltage and clock limits and record them in `docs/memory-map.md`. The datasheet's absolute voltage and temperature limits could not be fetched, so that check moves to 9.5.
  - [x] 1.4 Confirm that the Pico SDK (2.x, RP2350 support) and a toolchain are installed, and record versions in `README.md`.

- [x] 2. Restructure the repository for the RP2350 (R1.1, R1.3, R1.4, R1.5)
  - [x] 2.1 Create `engine/`, `midi/`, `ui/console/`, `board/rp2350/`, `host/`, `docs/` as in design section 2 and move the retained DSP, FX and parameter sources into `engine/` with `git mv`, keeping licence headers.
  - [x] 2.2 Delete the STM32 files and directories listed in design section 2, including `cmake/stm32f765.cmake` and `cmake/arm-none-eabi.cmake`.
  - [x] 2.3 Write the top-level `CMakeLists.txt` (Pico SDK 2.1.1 import, board `pico2`, target `lxr`, `.uf2` output, `-mfp16-format=ieee`, copy-to-RAM binary type) and `CMakePresets.json` with `release` and `debug` presets. Add `-Wdouble-promotion -Wfloat-conversion -fsingle-precision-constant` for `engine/`.
  - [x] 2.4 Add the host test target (separate CMake project under `host/`, no SDK) and the `check_engine_deps` target (design 4). `check_engine_deps` is not part of `all` yet because the legacy includes still fail it; task 3.5 adds `ALL`.
  - [x] 2.5 Update `README.md` (build steps for the Pico 2, wiring, flashing in BOOTSEL mode) and trim the bootloader parts of `NOTICE.md`.
  - [x] 2.6 Verify: `cmake --preset release && cmake --build --preset release` produces `lxr.uf2` (it may still be an empty `main`), and the host target configures.

- [x] 3. Remove the sequencer and cut engine-to-UI links (R2, R6.1)
  - [x] 3.1 Delete `Sequencer/`, `TriggerOut.c`, `USB/`, `cs4344_cs5343.c`, `AudioCodecManager.c`, FatFs use and all LCD/menu/button/LED/encoder/pot/front-panel sources not already removed.
  - [x] 3.2 Remove sequencer, clock and menu calls from `MidiParser.c`, `MidiVoiceControl.c`, `CortexParser.c` and `Soundengine.c`. Clock and transport bytes are consumed and dropped. Replace `seq_setMute` with a per-voice engine mute flag.
  - [x] 3.3 Document the sequencer-only parameters and keep the remaining `ParamEnums` values unchanged. The IDs stay in the enum (CC IDs must not move) and task 4's table leaves them out. Recorded in `docs/removed-params.md`.
  - [x] 3.4 Remove per-step velocity and parameter-lock modulation paths driven by the sequencer while keeping MIDI-velocity modulation (R2.6).
  - [x] 3.5 Add `ALL` to the `check_engine_deps` target in `CMakeLists.txt`. Remove the leftover STM32 pieces still in `Core/` (`main.h`, `delay.c/h`, the `Core/Inc/IO`, `menu` and legacy UI files) and the HD44780 row in `NOTICE.md`. Verify: `check_engine_deps` passes, and a `grep` for `seq_`, `menu_`, `lcd_`, `usb_` in `engine/` and `midi/` finds nothing.

- [x] 4. Parameter metadata table (R6.5)
  - [x] 4.1 Write a one-off script `host/scripts/gen_param_table.py` that reads `Parameters.h`, `Cc2Text.c`, `CcNr2Text.h` and `MenuText.h` from git history and emits the first version of `engine/param_table.c` (id, name, voice, kind, min, max, default, enum names).
  - [x] 4.2 Review the generated table by hand: unique lower-case names (for example `filter_freq_1`, `velod4`, `fx_dry_wet`), correct stored ranges, enum names for waveforms and filter types. The names follow the old enum identifiers, so they are not the dotted names of the design's examples. The table has 245 rows: 228 sound parameters plus 17 MIDI settings (channels, notes, filters).
  - [x] 4.3 Add the host test that every non-removed `ParamEnums` ID below `END_OF_SOUND_PARAMETERS` has exactly one row and that names are unique.

- [x] 5. Engine API and command ring (R4.4, R6.2, R6.3, R6.4)
  - [x] 5.1 Write `engine/include/lxr/engine.h` as in design section 3. Differences from the design sketch: `lxr_engine_render` takes one interleaved stereo buffer, there are 7 voice slots (the hi-hat has closed and open), `lxr_trigger_note` adds an explicit pitch, and the metadata functions live in `lxr/param_info.h`. Presets (`lxr_preset_*`) are added by tasks 11 and 12.
  - [x] 5.2 Implement the SPSC command ring (256 entries) and the shadow parameter copy. Core 1 side drains the ring at the start of `lxr_engine_render`.
  - [x] 5.3 Implement `lxr_trigger`, `lxr_param_set/get`, `lxr_param_find`, `lxr_param_info`, `lxr_set_param_callback`, `lxr_get_stats`, applying commands through the existing CC handler (moved from `MidiParser.c` to `engine/src/param_apply.c`) with its `valueShaper` scaling. The MIDI parser now only decodes bytes and calls the Engine API.
  - [x] 5.4 Implement `ui/ui_iface.h` (`ui_register`, fan-out of parameter changes).
  - [x] 5.5 Host unit tests: set/get round trip, out-of-range rejection, callback fires once per change, trigger of every voice produces non-silent output.

- [x] 6. MIDI parser (R4.3, R4.4, R4.5, R4.7, R2.3)
  - [x] 6.1 Port the running-status parser, note-to-voice mapping, CC and NRPN handling to `midi/midi_parser.c`, calling only `lxr_*` functions.
  - [x] 6.2 Add the error path: on framing or overrun error or a stray data byte, drop the partial message, resync on the next status byte, and increment the `midi_errors` counter.
  - [x] 6.3 Host unit tests (`host/test_midi_parser.c`, against a recording mock of the Engine API): channel routing, note off ignored, running status, note map, global channel, CC and NRPN mapping, value clamping, real-time bytes inside a message, system messages ignored, error resync, stray data, receive filter. Velocity is passed through unchanged to the voice trigger code, which is unchanged from the old firmware, so the test checks the pass-through. Fixed on the way: real-time bytes (clock) broke a message they interrupted, MIDI channels are stored 1..16 (the table had 0..15), and per-voice CCs were matched against the next voice's channel (old off-by-one).

- [x] 7. Serial console (R7.2 to R7.7)
  - [x] 7.1 Implement `ui/console/console.c` with all commands from design section 5 against a character-source and a character-sink function pointer. The `preset` commands need the preset storage, so task 12.2 adds them.
  - [x] 7.2 Implement the non-blocking TX ring behaviour (drop when full) and the deferred `watch` output.
  - [x] 7.3 Host `lxr_console` program on stdin/stdout.
  - [x] 7.4 Host unit tests for each command, including errors: unknown parameter, value out of range, bad voice name, bad slot number.

- [x] 8. Host render tool and golden audio (R5.5, R6.6)
  - [x] 8.1 Implement `host/lxr_render` (text MIDI script in, 16-bit 44.1 kHz WAV out) and three scripts in `host/scripts/`: `voices.txt` (all seven voice slots at velocity 40, 90, 127), `cc_sweep.txt` (filter cutoff CC sweep, then drum 1 into the delay with an NRPN sweep of fx_p1), `dense_retrigger.txt` (every slot every 47 ms for 10 s). Scripts can also call `set <param> <value>` to configure channels and the note map.
  - [x] 8.2 Render the golden WAVs, listen to them, and commit them to `host/golden/`. Approved by the user after listening. Facts measured so far: every slot sounds, velocity does not change level (factory kit has volume modulation off, as on the LXR), dense_retrigger saturates 1.05% of samples (seven full-scale voices summed).
  - [x] 8.3 Add the comparison tool `host/wavcmp` (peak difference at most 4 LSB, RMS below 1 LSB) and wire everything into CTest.
  - [x] 8.4 Fix the roughly 108 silent float-to-double promotions found in task 1 (`docs/memory-map.md` section 4) and verify the host build is clean under `-Wdouble-promotion -Werror` (R5.1). Done by changing every `double` in the engine to `float` and every libm call to its `f` variant (including `fma`). Output change versus the double version: 0.22 to 0.90 LSB RMS, at most 7 LSB peak. Both builds use `-Werror=double-promotion`, and the Pico build checks the engine library with `cmake/check_no_double.cmake` (no `__aeabi_d*`/`f2d` helpers, no double libm).

- [ ] 9. Audio output, performance measurement and clock (R3, R5.1, R5.2)
  - [x] 9.1 Implement `board/rp2350/i2s.pio` and `audio_i2s.c`: PIO program on GP9/GP10/GP11, fractional divider computed from the configured clock in `board/rp2350/clocks.h`, two DMA channels in ping-pong, completion IRQ flags core 1.
  - [x] 9.2 Implement `main.c`: init, start core 1 audio loop (wait for flag, `lxr_engine_render`, interleave, record Block time and underruns), core 0 main loop with a startup test tone sequence behind a compile-time option (`-DLXR_BOOT_DEMO=ON` plays every voice once after boot). The engine renders interleaved stereo, so the DMA sends the render buffer directly with no interleave copy. The on-board LED (GP25) blinks at 1 Hz while core 0 runs.
  - [x] 9.3 **Hardware:** wire the PCM5102A with the strapping in design 6.4. Verify a trigger of each voice by the console `trigger` command over the USB serial port (`console_usb.c`). Done on the RP2350-Zero: the boot demo plays all voices, the USB console triggers the snare, `status` reported worst_block_us 1038, underruns 0 (snare only, 150 MHz).
  - [x] 9.4 Measure `worst_block_us` at 150 MHz with all six voices and FX active (design section 9, stage 1). Record in `docs/memory-map.md`. Use the console command `bench del 10` (all seven slots every 46 ms, drum 1 into the delay), also `bench drv` / `cmp` / `rng` for the other effects. Result: 1149 us worst at 150 MHz (compressor), budget missed; see `docs/memory-map.md` section 9.
  - [x] 9.5 Before any overclocking, read the RP2350 datasheet electrical characteristics and lower the 250 MHz, 1.20 V and 70 °C limits if they are tighter. If the pass criterion (under 1000 µs) is missed, overclock in steps per design section 9 stage 2, running the 10-minute soak and temperature check at each step. Keep the lowest passing clock in `clocks.h` and record every step's result. Result: 200 MHz is the lowest passing step (860 us); the user chose **250 MHz at 1.10 V** as the default (689 us worst, soak 600 s: 0 underruns, 41.5 C). Clock and voltage are build options (`LXR_SYS_CLOCK_KHZ`, `LXR_VREG_VOLTAGE`), with the 250 MHz / 1.20 V limits enforced at configure time.
  - [ ] 9.6 Listen for jitter noise on the PCM5102A at the chosen clock. If audible, stop and ask the user about the 48 kHz fallback (needs approval).
  - [ ] 9.7 Commit the linker map summary to `docs/memory-map.md` (R5.2) and confirm the image placement decision from task 1.2 against the real link.

  - [x] 9.8 Move the console from UART1 to the USB port (USB CDC via `stdio_usb`) and make the Waveshare RP2350-Zero the default board (`-DPICO_BOARD=pico2` still builds for the Pico 2). Both boards build.

- [ ] 10. MIDI input (R4.1, R4.2, R4.6, R4.7)
  - [ ] 10.1 Implement `board/rp2350/midi_uart.c`: UART0 RX on GP1 at 31250 baud 8N1, DMA channel in ring mode into a 512-byte ring, error flag polling.
  - [ ] 10.2 Feed the ring into `midi/midi_parser.c` from the core-0 main loop.
  - [ ] 10.3 Confirm from the `.map` file that TinyUSB contains only the CDC class (no MIDI class) and that the USB port carries only the console and the reset interface.
  - [ ] 10.4 **Hardware:** build the 6N138 input circuit (design 6.4). Verify note triggers and a CC sweep from a MIDI controller or interface.
  - [ ] 10.5 **Hardware:** measure note-to-audio latency with a scope or logic analyser on the MIDI line and the I2S data line. It must be at most 2 Blocks (2.9 ms).
  - [ ] 10.6 **Hardware:** send a continuous 31250-baud byte stream with a deliberately corrupted byte every second and confirm `midi_errors` counts them and playing resumes on the next valid message.

- [ ] 11. Preset serialization and factory defaults (R8.1, R8.3, R8.4, R2.4)
  - [ ] 11.1 Implement `engine/preset.c`: pack and unpack the 4 KB sector image (magic, version, name, parameter bytes, CRC32) and the globals sector. No I/O.
  - [ ] 11.2 Convert the existing factory kit data (`initKit.c`) into the factory-default parameter bytes.
  - [ ] 11.3 Optional import tool `host/scripts/import_kit.py` that turns an old LXR kit file into a preset image and skips pattern data.
  - [ ] 11.4 Host unit tests: round trip, flipped bit fails the CRC, blank (0xFF) sector loads factory defaults, 16 slots independent.

- [ ] 12. Preset flash storage (R8)
  - [ ] 12.1 Implement `board/rp2350/preset_flash.c` for the last 17 sectors of flash using the SDK flash erase and program routines with interrupts disabled on core 0 only. Hook it to `lxr_preset_load/save` and the boot load of the last-used slot.
  - [ ] 12.2 Wire the `preset` console commands to it.
  - [ ] 12.3 **Hardware:** save a preset while a drum loop plays from a MIDI sequencer. Record the audio output and confirm no gap (R8.2). If the image is not copy-to-RAM (task 1.2), measure the gap and stop for user approval of the fade fallback.
  - [ ] 12.4 **Hardware:** send MIDI continuously during a save and confirm no bytes are lost (the UART DMA ring from task 10.1).
  - [ ] 12.5 **Hardware:** power-cycle after a save and confirm the module boots to the saved slot. Erase the preset region and confirm it boots to factory defaults.

- [ ] 13. Conditional: split rendering across both cores (R5.3)
  Only if task 9.5 fails at the highest allowed clock. Present the measurements to the user and get approval first. Skip and mark done as "not needed" otherwise.
  - [ ] 13.1 Split voices and FX between cores per design section 9 stage 3, with a shared summing buffer and one Block of added latency.
  - [ ] 13.2 Re-run the task 9.4 measurement, the task 10.5 latency check (the budget stays 2 Blocks, so verify it) and the host-versus-Pico golden comparison.

- [ ] 14. Host-versus-Pico comparison and final acceptance
  - [ ] 14.1 Add the console `render <seconds>` command on the Pico that plays the compiled-in script and dumps PCM over the USB serial port. Add a host script that captures it and runs `host/wavcmp` against the golden WAV (R5.5).
  - [ ] 14.2 Run a 10-minute soak on hardware with all six voices retriggered at the maximum rate from a MIDI source. Confirm zero underruns and zero MIDI errors (R3.2).
  - [ ] 14.3 Build with no UI registered and with the console registered, and confirm both boot and play from MIDI (R6.3).
  - [ ] 14.4 Walk through every acceptance criterion in `requirements.md` and record the result (pass, or the exact evidence) in `docs/acceptance.md`.
  - [ ] 14.5 Update `README.md` with the final pin table, the MIDI input circuit, PCM5102A wiring, the chosen clock and voltage, and the console command list.

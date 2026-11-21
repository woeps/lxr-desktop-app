# Design: LXR sound module on RP2350 (Waveshare RP2350-Zero)

Implements `requirements.md` in this directory. Requirement numbers are written as R<n>.

## 1. Overview

The LXR drum engine moves to the RP2350 as a MIDI-driven sound module. The code is split into layers with one-way dependencies:

```
  board/   (pico-sdk: PIO I2S, UARTs, flash, cores)         <- hardware only
     |
  midi/    (serial MIDI byte stream -> Engine API calls)
  ui/      (serial console now, encoder+OLED later)         <- Engine API only
     |
  engine/  (voices, mixer, FX, parameter table, presets)    <- no hardware, no UI
```

`engine/` compiles unchanged for the Pico and for the host test build. `midi/` and `ui/console` also compile on the host. Only `board/` needs the Pico SDK.

### Findings from the current code that drive this design

- The engine is not separable yet. `MidiParser.c` includes `menu/menu.h`, the sequencer, `usb_manager.h` and `TriggerOut.h`. `presetManager.c` includes `lcd.h`, `menu.h`, FatFs and `IO/uart.h`. `Uart.c` includes `stm32f7xx_hal.h` and `frontPanelParser_ui.h`. Section 4 cuts these links.
- The DSP is tuned for **44.1 kHz** (`transientTables.h`, `Delay.c`, `SYNTH_FS`). The design keeps 44.1 kHz so no voice needs retuning (R3.1).
- The parameter model is `parameterArray[END_OF_SOUND_PARAMETERS]`, an array of `{void *ptr; uint8_t type}` indexed by the `ParamEnums` enum in `Parameters.h`. The enum values are the CC/NRPN IDs, so they stay stable (R4.5).
- The FX bus uses a 32768-entry `__fp16` buffer (64 KB). The Cortex-M33 supports `__fp16` storage with hardware conversion, so the buffer stays as is.
- `Samples.c` is about 200 KB of source. The built size is unknown until linked. Task 1 measures it, and section 6.2 depends on the result.
- The mixer renders through `mixer_calcNextSampleBlock(int16_t *l, int16_t *r)` with `OUTPUT_DMA_SIZE` = 64 frames per Block. This stays as the engine's render entry point.

## 2. Repository layout after the change

```
CMakeLists.txt               pico-sdk project (board waveshare_rp2350_zero, or pico2), host test target
cmake/pico_sdk_import.cmake
engine/                      from Core/Src/Soundengine/{DSPAudio,FxBus.c,Soundengine.c}, Parameters.c
  include/lxr/engine.h       the Engine API (section 3)
  param_table.c              metadata table (section 3.3)
  preset.c                   serialize/deserialize + slot logic, no I/O
midi/                        midi_parser.c (from MidiParser.c, MidiVoiceControl.c, CortexParser.c), MIDI byte FIFO
ui/
  ui_iface.h                 UI layer interface (section 5)
  console/console.c          serial console
board/rp2350/                 audio_i2s.c + i2s.pio, midi_uart.c, console_usb.c, preset_flash.c, main.c, pins.h, clocks.h
host/                        test_render.c, test_console.c, golden/*.wav, scripts/*.txt
docs/memory-map.md           committed linker map summary (R5.2)
```

Removed from the tree (R1.4, R2.1): `Drivers/`, `Middlewares/`, `FATFS/`, `USB_DEVICE_MIDI/`, `STM32F765VGTX_FLASH.ld`, `Core/Startup`, `Core/Src/{stm32f7xx_*.c,system_stm32f7xx.c,syscalls.c,sysmem.c}`, `Core/Src/Soundengine/{Sequencer,USB,cs4344_cs5343.c,AudioCodecManager.c,TriggerOut.c}`, the whole menu/LCD/button/LED/encoder/pot/front-panel UI, `flash_if.c`, `cmake/stm32f765.cmake`, `cmake/arm-none-eabi.cmake`, the bootloader image tooling, and the README sections on the SD-card updater. Licence headers and `NOTICE.md` stay (R1.5); the `NOTICE.md` bootloader paragraph is trimmed to match.

## 3. Engine API (R6)

One header, `engine/include/lxr/engine.h`. Plain C, no SDK headers.

```c
#define LXR_NUM_VOICES 6
typedef enum { LXR_VOICE_DRUM1, LXR_VOICE_DRUM2, LXR_VOICE_DRUM3,
               LXR_VOICE_SNARE, LXR_VOICE_CYMBAL, LXR_VOICE_HIHAT } lxr_voice_t;

typedef struct {
    uint16_t id;            /* ParamEnums value = CC/NRPN id */
    const char *name;       /* "d1.freq", "snare.decay" ... */
    int8_t voice;           /* -1 for global/FX/mixer */
    uint8_t kind;           /* LXR_KIND_UINT8, _ENUM, _PAN, _FLOAT_MAPPED */
    uint8_t min, max, def;
    const char *const *enum_names; /* NULL unless kind == ENUM (waveforms etc.) */
} lxr_param_info_t;

typedef void (*lxr_param_cb)(uint16_t id, uint8_t value, void *user);

void     lxr_engine_init(uint32_t sample_rate);                 /* 44100 */
void     lxr_engine_render(int16_t *l, int16_t *r, uint32_t n); /* n == 64; audio core only */

void     lxr_trigger(lxr_voice_t v, uint8_t velocity);
int      lxr_param_set(uint16_t id, uint8_t value);   /* -1 if id/value invalid */
int      lxr_param_get(uint16_t id, uint8_t *value);
uint16_t lxr_param_count(void);
const lxr_param_info_t *lxr_param_info(uint16_t index);
const lxr_param_info_t *lxr_param_find(const char *name);
void     lxr_set_param_callback(lxr_param_cb cb, void *user);

int      lxr_preset_load(uint8_t slot);               /* 0..15 */
int      lxr_preset_save(uint8_t slot);
int      lxr_preset_name(uint8_t slot, char out[9]);

typedef struct { uint8_t cpu_percent; uint32_t worst_block_us; uint32_t underruns;
                 uint32_t midi_errors; } lxr_stats_t;
void     lxr_get_stats(lxr_stats_t *out);             /* R3.5, R4.7 */
```

### 3.1 Threading model

Two cores. **Core 1** runs only the audio loop: it waits for a free half of the I2S DMA ping-pong buffer, calls `lxr_engine_render`, and records the Block time. **Core 0** runs the MIDI parser, the console and flash saves.

Core 0 never writes engine state directly. `lxr_trigger` and `lxr_param_set` push a 4-byte command `{type, id/voice, value}` into a lock-free single-producer/single-consumer ring (256 entries, power of two) that core 1 drains at the start of each Block. The shadow copy of parameter values read by `lxr_param_get` is written by core 0 in the same call, so UI reads never touch core 1 state. The parameter callback runs in the calling context (core 0) after the command is queued. Every parameter change originates on core 0 (MIDI, console, preset load), so no callback is made from core 1.

### 3.2 Parameter mapping

`parameterArray[]` pointers into voice structs stay inside the engine. `lxr_param_set` writes the shadow copy and enqueues a command. Core 1 applies it with the existing `paramArray_setParameter` logic, including `valueShaper` scaling, so DSP behaviour is unchanged (R4.4).

### 3.3 Metadata table

`param_table.c` is one `static const lxr_param_info_t table[]` built from the names and ranges now spread over `Cc2Text.c`, `CcNr2Text.h` and `MenuText.h`. The waveform and filter-type names move into `enum_names` arrays. A script generates the table once at port time, and it is maintained by hand afterwards (R6.5). A host test asserts that every `ParamEnums` ID below `END_OF_SOUND_PARAMETERS` that is not sequencer-only has exactly one table row.

## 4. Sequencer removal and decoupling (R2, R6.1)

| Source | Action |
|---|---|
| `Sequencer/` (sequencer, Euclid, clockSync) | Delete. |
| `MidiParser.c` | Remove `seq_*`, clock, start/stop and song-position handling. Clock and transport status bytes (0xF8, 0xFA, 0xFB, 0xFC, 0xF2) are consumed and dropped (R2.3). Remove the `menu/menu.h` and `usb_manager.h` includes and calls. `seq_setMute` is replaced by an engine mute flag per voice that CC messages still set. |
| `MidiVoiceControl.c` | Drop sequencer includes and `TriggerOut`. Keep voice trigger and note-to-voice mapping. |
| Sequencer-only `ParamEnums` (tempo, swing, step/pattern, per-step locks) | Remove from the engine table. Enum values for the remaining parameters are **not** renumbered, so CC/NRPN IDs stay as today (R2.5, R4.5). |
| `TriggerOut.c` | Delete (hardware trigger jacks of the desktop unit). |
| `Preset/` | Rewrite as pure serialize/deserialize (section 7). Pattern data is skipped (R2.4). |
| `Uart.c` (STM32 HAL) | Replace by `board/rp2350/midi_uart.c` plus a ring buffer. |

A CMake target `check_engine_deps` greps the sources and fails the build if any file under `engine/` or `midi/` includes `menu`, `lcd`, `button`, `led`, `encoder`, `pico/`, `hardware/` or `stm32` headers (R6.1).

## 5. UI layer interface (R6.3, R6.4, R6.7, R7.8)

```c
typedef struct {
    const char *name;
    void (*init)(void);
    void (*poll)(void);                        /* called from the core-0 main loop */
    void (*on_param_changed)(uint16_t id, uint8_t value);
} ui_t;
void ui_register(const ui_t *ui);              /* at most 4 */
```

`main.c` registers UIs at startup. With none registered the module boots and plays from MIDI (R6.3). Each UI calls only `lxr_*` functions. The engine callback fans out `on_param_changed` to every registered UI. A later encoder-and-OLED UI is another `ui_t` plus its own `board/` driver, with no engine or console change.

### Serial console (R7)

`ui/console/console.c` is a line-based parser (80 characters per line at most, tokens split on spaces) that reads from a character-source function pointer, so it runs on a UART (Pico) or stdin (host).

| Command | Behaviour |
|---|---|
| `help` | List commands. |
| `params [voice]` | Print name, current value and `min..max`, optionally filtered by voice (`d1`, `d2`, `d3`, `snare`, `cym`, `hh`, `global`). |
| `get <name>` / `set <name> <v>` | Look up with `lxr_param_find`. `set` accepts a number or, for enum parameters, an enum name. Errors: `unknown param`, `value out of range min..max`. |
| `trigger <voice> [vel]` | Calls `lxr_trigger`; default velocity 100. |
| `preset load <n>` / `preset save <n>` / `preset list` | Slots 0 to 15. |
| `watch on\|off` | Print `id name=value` for each parameter change. The callback queues the text and the main loop prints it. |
| `status` | Print `lxr_stats_t`. |

Console output goes through a 1 KB TX ring. `console_usb.c` hands a character to the USB CDC driver only when its transmit buffer has room, so the ring drops text and never blocks when no terminal is reading, and the console cannot stall core 0's MIDI work (R7.7). Line editing is limited to backspace.

The console uses the SDK's `stdio_usb` (TinyUSB, CDC class only). Its device task runs from a low-priority interrupt on core 0. `stdio_usb` also exposes the reset interface, so `picotool load -f lxr.uf2` reboots the module into BOOTSEL and flashes it without the BOOT button.

## 6. Board layer

### 6.1 Clocks and audio (R3)

- System clock 150 MHz by default, raised only through the overclock stage of section 9. The PIO divider is computed from the configured clock at build time (for example 200 MHz / 2.8224 MHz = 70.86).
- **I2S via PIO**: a 2-instruction-per-bit program with side-set for BCK and LRCK (the standard `pico-extras` I2S shape), 16-bit stereo, 32 BCK per frame. BCK = 44100 x 32 = 1.4112 MHz, so the PIO clock is 2 x BCK = 2.8224 MHz and the divider is 150 MHz / 2.8224 MHz = 53.15 (fractional, 16.8 format). The fractional divider adds edge jitter of at most one system-clock period (6.7 ns). The PCM5102A regenerates its internal clocks from BCK with a PLL, so this is acceptable. If hardware measurement shows jitter noise, the fallback is the 48 kHz option of R3.1 with a 153.6 MHz system clock. That costs a DSP retune, so it needs the user's approval.
- **DMA**: two channels chained in ping-pong, each moving one Block of 64 interleaved stereo frames (256 bytes) to the PIO TX FIFO. The completion IRQ flags core 1. A 64-frame Block at 44.1 kHz lasts 1.45 ms, so the R4.6 latency budget (2 Blocks) is 2.9 ms.
- The engine renders separate L and R `int16_t` buffers. `audio_i2s.c` interleaves them into the DMA buffer.

### 6.2 Memory and flash (R5.2, R5.4)

Budget (RP2350: 520 KB SRAM, 4 MB flash on both the RP2350-Zero and the Pico 2):

| Item | Estimate |
|---|---|
| FX buffer (`__fp16` x 32768) | 64 KB |
| Voice, filter, mixer and reverb state | to be measured (task 1) |
| Audio DMA buffers (2 x 256 B) | 0.5 KB |
| MIDI and console FIFOs and rings | about 2 KB |
| Code | about 100 to 150 KB (estimate) |
| Stacks (2 x 4 KB) | 8 KB |

Decision, to be confirmed by task 1's numbers: **copy the whole image to RAM at boot** (`pico_set_binary_type(lxr copy_to_ram)`). Core 1 then reads code and sample/wavetable data with deterministic timing (no XIP cache misses in the audio loop), and preset saves stay glitch-free (section 7.3). Code plus read-only data must fit in 520 KB together with the rest of the budget. If `Samples.c` and the tables make that too large, the fallback is: DSP code and hot tables in RAM (`__not_in_flash_func`, `__scratch_x`) with bulk sample data left in flash. Preset saves then need the mute-and-ramp approach of section 7.3, which breaks R8.2 and needs the user's approval (R5.3).

### 6.3 Double precision

The Cortex-M33 FPU is single-precision. The engine builds with `-Wdouble-promotion -Wfloat-conversion -fsingle-precision-constant`. The host test build adds `-Werror` to these warnings, which catches silent double math (R5.1).

### 6.4 Pin table (R7.6)

All pins live in `board/rp2350/pins.h` (R7.5). Every pin is on the edge headers of both the RP2350-Zero and the Pico 2. The Pico pin column is for the Pico 2 only.

| Function | GPIO | Pico pin | Notes |
|---|---|---|---|
| MIDI IN (UART0 RX) | GP1 | 2 | From H11L1 output (pin 4), 1 kΩ pull-up to 3V3 |
| I2S DIN | GP9 | 12 | To PCM5102A DIN |
| I2S BCK | GP10 | 14 | To PCM5102A BCK (side-set base) |
| I2S LRCK | GP11 | 15 | To PCM5102A LCK (BCK + 1, required by the PIO program) |
| Serial console | USB | | USB CDC on the board's USB-C (RP2350-Zero) or micro-USB (Pico 2) port |
| Status LED | GP25 (Pico 2 only) | 1 Hz heartbeat. The RP2350-Zero's WS2812 on GP16 is not driven. |
| Reserved for a later UI | GP12, GP13, GP14, GP6, GP7 | | Encoder A, B, push; I2C1 SDA, SCL for the OLED |

PCM5102A module strapping: SCK to GND (internal PLL), FMT to GND (I2S), XSMT to 3V3 (unmute), FLT to GND, DEMP to GND. Power from VBUS (5 V) or 3V3, depending on the module's regulator.

MIDI input circuit (standard MIDI 1.0 receiver with an H11L1, which runs from 3 V and has a Schmitt-trigger open-collector output): 3.5 mm TRS jack, Type A (CA-033): ring (DIN pin 4) through 220 Ω to H11L1 pin 1 (anode), tip (DIN pin 5) to pin 2 (cathode), sleeve unconnected, a 1N4148 across pins 1 and 2 (cathode to pin 1), pin 6 (Vcc) to 3V3 with 100 nF to GND, pin 5 to GND, pin 4 (output) to GP1 with a 1 kΩ pull-up to 3V3. The output is low while MIDI current flows, which is the UART polarity, so no inversion is needed. A 6N138 also works if powered from 5 V with its output pulled up to 3V3. A Type B cable (tip and ring swapped) does no harm but delivers no signal.

## 7. Presets (R8)

### 7.1 Format

One preset is one 4 KB flash sector containing: magic `LXRP`, a version byte, the payload length, an 8-character name, the `END_OF_SOUND_PARAMETERS` (247) parameter bytes in ID order, and a CRC-32 (zlib polynomial). The exact layout is in `engine/include/lxr/preset.h`. A 17th sector holds globals (MIDI channel and note map, last-used slot). The region is the last 17 sectors (68 KB) of the 4 MB flash. Presets store the 0 to 127 parameter bytes, which is also what MIDI delivers, so loading goes through the same `lxr_param_set` path.

### 7.2 Boot

On boot core 0 reads the last-used slot from the globals sector. If that slot's CRC is valid it is loaded. Otherwise the built-in factory defaults compiled in from the `initKit.c` data are loaded (R8.3).

### 7.3 Saving without audio glitches (R8.2)

With the copy-to-RAM image (6.2) core 1 never reads flash, so core 0 can erase and program a sector while audio continues. Core 0 calls `flash_range_erase` and `flash_range_program` directly with interrupts disabled **on core 0 only**. It must not use `flash_safe_execute`, which by default pauses core 1 through the multicore lockout and would stop the audio. While interrupts are off the USB device task does not run, so the console stalls for the length of the erase (50 to 100 ms). USB CDC tolerates this; the host just sees a short delay. MIDI arrives on core 0's UART, and an erase takes 50 to 100 ms, but the UART FIFO holds only 32 bytes (about 10 ms at 31250 baud). So the MIDI UART RX is read by DMA into a 512-byte ring that runs without the CPU, and core 0 drains the ring after the save. Task 12 sends MIDI during a save and checks that no bytes are lost.

If copy-to-RAM does not fit, the saver fades the master output to silence over 5 ms, saves, and fades back. That is an audible gap and needs user approval.

### 7.4 Wear

Saves happen only on an explicit `preset save`. A sector erase is rated for 100,000 cycles, which is not a concern at this rate.

## 8. MIDI input (R4)

UART0 runs at 31250 baud, 8N1, RX only. A DMA channel in ring mode fills a 512-byte ring from the RX FIFO. Core 0's main loop drains the ring into the running-status parser, which calls `lxr_trigger` and `lxr_param_set`. Framing and overrun errors are read from UART status on each loop pass and counted in `midi_errors` (R4.7). On an error the parser drops the partial message and waits for the next status byte. USB is not initialised and TinyUSB is not linked (R4.2). `pico_stdio_usb` is disabled in CMake.

## 9. Real-time budget (R3.2, R5.3)

The original M7 at 216 MHz was dual-issue and used ITCM. The M33 at 150 MHz is single-issue, so I expect the usable throughput to be roughly 2.5 to 3 times lower. The repo does not document the desktop firmware's CPU load, so the first real number comes from a hardware measurement.

1. **Single render core at 150 MHz.** Core 1 renders everything. Measure `worst_block_us` with all six voices triggered together and all FX on. Pass criterion: worst Block under 1000 µs (69% of the 1450 µs Block period).
2. **If stage 1 fails, overclock first.** Raise the system clock in steps through the SDK (`set_sys_clock_khz`, preceded by `vreg_set_voltage`): 150 MHz (default 1.10 V), then 200 MHz, then 250 MHz at a raised core voltage. Hard limits: **250 MHz and 1.20 V core voltage at most**, with no changes outside what the SDK exposes. Each step is kept only if all of the following hold: the Block pass criterion is met, a 10-minute full-load soak (R3.2) shows no underruns, no crash and no MIDI errors, and the chip stays within a temperature check (the on-chip sensor, read by the `status` console command, stays below 70 °C). The lowest passing step wins. The clock is a single constant in `board/rp2350/clocks.h`, so it is easy to change back. The board layer recomputes the PIO divider (6.1) and the flash clock divider for the new system clock. Overclocking is outside the chip's official 150 MHz rating, so the final frequency and voltage are documented in `docs/memory-map.md` and the README and are the user's explicit choice.
3. **If overclocking is not enough**, split rendering over both cores: voices 1 to 3 and the snare on core 1, cymbal, hi-hat and FX bus on core 0, summed through a shared buffer at a cost of one Block of latency. This is a large change, so it only happens if the measurement still requires it, and the user approves it first (task 13). Reduced-quality options (shorter reverb, fewer FX) are the last resort and also need approval (R5.3).

**Outcome (task 9.5):** 150 MHz gave 1149 us worst under full load, 200 MHz 860 us, 250 MHz 689 us, all at 1.10 V. The user chose 250 MHz at 1.10 V as the default after a 10-minute soak without underruns at 41.5 C. Stage 3 (core split) is not needed.

## 10. Host test build (R5.5, R6.6)

`host/` builds `engine/`, `midi/` and `ui/console` with the host C compiler into:

- `lxr_render`: reads a text MIDI script (`t=<ms> <hex bytes>` lines), feeds it through the MIDI parser, renders N seconds to a 16-bit 44.1 kHz WAV.
- `lxr_console`: the console on stdin/stdout, driving the same engine.
- CTest unit tests for the parser (running status, clock bytes ignored, partial message on error), the console (each command and error case), the preset serializer (round trip, bad CRC) and the parameter-table coverage check.

Golden WAVs come from the host build after a listening check, and are committed. The Pico build renders the same script from a compiled-in copy through a console command (`render <seconds>`) and prints a checksum of the PCM, and a host tool compares a dump against the golden file. Single-precision results can differ in the last bit between the host and the M33, so the tolerance is **peak absolute difference of at most 4 LSB (16-bit) and RMS difference below 1 LSB**.

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| M33 at 150 MHz is too slow for six voices plus full FX | Underruns | Stage-1 measurement, then overclock (max 250 MHz, 1.20 V), then core split, then approved quality cuts (section 9) |
| Overclocked part is unstable or runs hot | Crashes, glitches | Soak test and temperature gate per step; lowest passing clock wins |
| Image too large for copy-to-RAM | Preset saves would glitch | Task 1 measures; fallback in 6.2 and 7.3 needs approval |
| Fractional PIO divider jitter audible on the PCM5102A | Noise | Hardware check; 48 kHz fallback needs approval |
| MIDI bytes lost during flash erase | Dropped notes | UART RX DMA ring (7.3), tested |
| Leftover menu/LCD calls in engine code | Late build breaks | `check_engine_deps` target from the first task |
| Hidden `double` math slows the audio path | CPU | `-Wdouble-promotion -Werror` on the engine |

## 12. Traceability

| Requirement | Sections |
|---|---|
| R1 build and run | 2, 6.1 |
| R2 sequencer removal | 4 |
| R3 audio | 6.1, 6.2, 9 |
| R4 MIDI | 4, 8 |
| R5 compute limits | 6.2, 6.3, 9, 10 |
| R6 UI abstraction | 3, 4, 5 |
| R7 UI: none + console | 5, 6.4 |
| R8 presets | 7 |

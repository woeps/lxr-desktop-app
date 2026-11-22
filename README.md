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

Sound parameters are set with CC and NRPN messages: CC 1 to 127 set parameters 0 to 126, and NRPN n
sets parameter 128 + n (CC 99 = 0, CC 98 = n, then the value on CC 6). A CC that belongs to one
voice is accepted on that voice's channel (channel 6 for the hi-hat) or the global channel; CCs for
the effect and other shared parameters, and all NRPNs, are accepted on any channel the module listens
on. The full list is in [MIDI implementation](#midi-implementation). Note off, clock, transport,
program change and system exclusive messages are ignored.

To keep the current sound as the one the module starts with, send the store command: NRPN 16128
(CC 99 = 126, CC 98 = 0) followed by CC 6 = 83 (0x53). Any other value on CC 6 does nothing. The
module then saves the live sound, as `preset save` does without a name, to the slot that is loaded
(or to the slot named by the saved settings if none is), and that slot becomes the boot sound. The
write takes a moment on the control core and does not interrupt playing notes. Finish with the NRPN
null (CC 99 = 127, CC 98 = 127) so that a later CC 6 cannot repeat the command. With `amidi`:
`amidi -p hw:1,0,0 -S 'B0 63 7E B0 62 00 B0 06 53 B0 63 7F B0 62 7F'`. The command is not a
parameter, so it is not in the table below.

## MIDI implementation

Every sound parameter, generated from the firmware's parameter table. "Values" is the range the
parameter accepts; a CC value above it is clipped. Named values are listed as number=name. The
console shows the same parameters by name (`params`, `get`, `set`).

<!-- midi-map:begin -->
| MIDI | Parameter | Voice | Values | Default | Controls |
|---|---|---|---|---|---|
| CC 2 | `osc_wave_drum1` | drum 1 | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | oscillator waveform |
| CC 3 | `osc_wave_drum2` | drum 2 | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | oscillator waveform |
| CC 4 | `osc_wave_drum3` | drum 3 | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | oscillator waveform |
| CC 5 | `osc_wave_snare` | snare | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Tri | oscillator waveform |
| CC 7 | `wave1_cym` | cymbal | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Noi | oscillator waveform |
| CC 8 | `wave1_hh` | hi-hat | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | oscillator waveform |
| CC 9 | `coarse1` | drum 1 | 0 to 127 | 31 | pitch, coarse |
| CC 10 | `fine1` | drum 1 | 0 to 127 | 63 | pitch, fine (about ±50 cent) |
| CC 11 | `coarse2` | drum 2 | 0 to 127 | 41 | pitch, coarse |
| CC 12 | `fine2` | drum 2 | 0 to 127 | 63 | pitch, fine (about ±50 cent) |
| CC 13 | `coarse3` | drum 3 | 0 to 127 | 58 | pitch, coarse |
| CC 14 | `fine3` | drum 3 | 0 to 127 | 63 | pitch, fine (about ±50 cent) |
| CC 15 | `coarse4` | snare | 0 to 127 | 45 | pitch, coarse |
| CC 16 | `fine4` | snare | 0 to 127 | 64 | pitch, fine (about ±50 cent) |
| CC 17 | `coarse5` | cymbal | 0 to 127 | 127 | pitch, coarse |
| CC 18 | `fine5` | cymbal | 0 to 127 | 63 | pitch, fine (about ±50 cent) |
| CC 19 | `coarse6` | hi-hat | 0 to 127 | 50 | pitch, coarse |
| CC 20 | `fine6` | hi-hat | 0 to 127 | 63 | pitch, fine (about ±50 cent) |
| CC 21 | `mod_wave_drum1` | drum 1 | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | modulator waveform |
| CC 22 | `mod_wave_drum2` | drum 2 | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | modulator waveform |
| CC 23 | `mod_wave_drum3` | drum 3 | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | modulator waveform |
| CC 24 | `wave2_cym` | cymbal | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | modulator 1 waveform |
| CC 25 | `wave3_cym` | cymbal | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | modulator 2 waveform |
| CC 26 | `wave2_hh` | hi-hat | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | modulator 1 waveform |
| CC 27 | `wave3_hh` | hi-hat | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | modulator 2 waveform |
| CC 28 | `noise_freq1` | snare | 0 to 127 | 127 | noise frequency |
| CC 29 | `mix1` | snare | 0 to 127 | 61 | noise mix |
| CC 30 | `mod_osc_f1_cym` | cymbal | 0 to 127 | 0 | modulator 1 pitch |
| CC 31 | `mod_osc_f2_cym` | cymbal | 0 to 127 | 0 | modulator 2 pitch |
| CC 32 | `mod_osc_gain1_cym` | cymbal | 0 to 127 | 0 | modulator 1 FM amount |
| CC 33 | `mod_osc_gain2_cym` | cymbal | 0 to 127 | 0 | modulator 2 FM amount |
| CC 34 | `mod_osc_f1` | hi-hat | 0 to 127 | 56 | modulator 1 pitch |
| CC 35 | `mod_osc_f2` | hi-hat | 0 to 127 | 127 | modulator 2 pitch |
| CC 36 | `mod_osc_gain1` | hi-hat | 0 to 127 | 127 | modulator 1 FM amount |
| CC 37 | `mod_osc_gain2` | hi-hat | 0 to 127 | 127 | modulator 2 FM amount |
| CC 38 | `filter_freq_1` | drum 1 | 0 to 127 | 127 | filter cutoff |
| CC 39 | `filter_freq_2` | drum 2 | 0 to 127 | 127 | filter cutoff |
| CC 40 | `filter_freq_3` | drum 3 | 0 to 127 | 127 | filter cutoff |
| CC 41 | `filter_freq_4` | snare | 0 to 127 | 127 | filter cutoff |
| CC 42 | `filter_freq_5` | cymbal | 0 to 127 | 68 | filter cutoff |
| CC 43 | `filter_freq_6` | hi-hat | 0 to 127 | 104 | filter cutoff |
| CC 44 | `reso_1` | drum 1 | 0 to 127 | 0 | filter resonance |
| CC 45 | `reso_2` | drum 2 | 0 to 127 | 0 | filter resonance |
| CC 46 | `reso_3` | drum 3 | 0 to 127 | 0 | filter resonance |
| CC 47 | `reso_4` | snare | 0 to 127 | 0 | filter resonance |
| CC 48 | `reso_5` | cymbal | 0 to 127 | 0 | filter resonance |
| CC 49 | `reso_6` | hi-hat | 0 to 127 | 0 | filter resonance |
| CC 50 | `veloa1` | drum 1 | 0 to 127 | 0 | amp envelope attack |
| CC 51 | `velod1` | drum 1 | 0 to 127 | 21 | amp envelope decay |
| CC 52 | `veloa2` | drum 2 | 0 to 127 | 0 | amp envelope attack |
| CC 53 | `velod2` | drum 2 | 0 to 127 | 13 | amp envelope decay |
| CC 54 | `veloa3` | drum 3 | 0 to 127 | 0 | amp envelope attack |
| CC 55 | `velod3` | drum 3 | 0 to 127 | 3 | amp envelope decay |
| CC 56 | `veloa4` | snare | 0 to 127 | 0 | amp envelope attack |
| CC 57 | `velod4` | snare | 0 to 127 | 10 | amp envelope decay |
| CC 58 | `veloa5` | cymbal | 0 to 127 | 0 | amp envelope attack |
| CC 59 | `velod5` | cymbal | 0 to 127 | 107 | amp envelope decay |
| CC 60 | `veloa6` | hi-hat | 0 to 127 | 0 | amp envelope attack |
| CC 61 | `velod6_closed` | hi-hat | 0 to 127 | 5 | amp envelope decay, closed hi-hat |
| CC 62 | `velod6_open` | hi-hat | 0 to 127 | 17 | amp envelope decay, open hi-hat |
| CC 63 | `vol_slope1` | drum 1 | 0 to 127 | 46 | amp envelope curve |
| CC 64 | `vol_slope2` | drum 2 | 0 to 127 | 11 | amp envelope curve |
| CC 65 | `vol_slope3` | drum 3 | 0 to 127 | 4 | amp envelope curve |
| CC 66 | `vol_slope4` | snare | 0 to 127 | 10 | amp envelope curve |
| CC 67 | `vol_slope5` | cymbal | 0 to 127 | 0 | amp envelope curve |
| CC 68 | `vol_slope6` | hi-hat | 0 to 127 | 6 | amp envelope curve |
| CC 69 | `repeat4` | snare | 0 to 127 | 0 | amp envelope repeats (clap-like retriggers) |
| CC 70 | `repeat5` | cymbal | 0 to 127 | 0 | amp envelope repeats (clap-like retriggers) |
| CC 71 | `mod_eg1` | drum 1 | 0 to 127 | 26 | pitch envelope decay |
| CC 72 | `mod_eg2` | drum 2 | 0 to 127 | 93 | pitch envelope decay |
| CC 73 | `mod_eg3` | drum 3 | 0 to 127 | 7 | pitch envelope decay |
| CC 74 | `mod_eg4` | snare | 0 to 127 | 14 | pitch envelope decay |
| CC 75 | `modamnt1` | drum 1 | 0 to 127 | 44 | pitch envelope amount |
| CC 76 | `modamnt2` | drum 2 | 0 to 127 | 14 | pitch envelope amount |
| CC 77 | `modamnt3` | drum 3 | 0 to 127 | 127 | pitch envelope amount |
| CC 78 | `modamnt4` | snare | 0 to 127 | 81 | pitch envelope amount |
| CC 79 | `pitch_slope1` | drum 1 | 0 to 127 | 22 | pitch envelope curve |
| CC 80 | `pitch_slope2` | drum 2 | 0 to 127 | 10 | pitch envelope curve |
| CC 81 | `pitch_slope3` | drum 3 | 0 to 127 | 14 | pitch envelope curve |
| CC 82 | `pitch_slope4` | snare | 0 to 127 | 15 | pitch envelope curve |
| CC 83 | `fmamnt1` | drum 1 | 0 to 127 | 0 | FM amount |
| CC 84 | `fm_freq1` | drum 1 | 0 to 127 | 0 | modulator pitch |
| CC 85 | `fmamnt2` | drum 2 | 0 to 127 | 0 | FM amount |
| CC 86 | `fm_freq2` | drum 2 | 0 to 127 | 0 | modulator pitch |
| CC 87 | `fmamnt3` | drum 3 | 0 to 127 | 0 | FM amount |
| CC 88 | `fm_freq3` | drum 3 | 0 to 127 | 0 | modulator pitch |
| CC 89 | `vol1` | drum 1 | 0 to 127 | 127 | volume |
| CC 90 | `vol2` | drum 2 | 0 to 127 | 127 | volume |
| CC 91 | `vol3` | drum 3 | 0 to 127 | 127 | volume |
| CC 92 | `vol4` | snare | 0 to 127 | 127 | volume |
| CC 93 | `vol5` | cymbal | 0 to 127 | 127 | volume |
| CC 94 | `vol6` | hi-hat | 0 to 127 | 127 | volume |
| CC 95 | `pan1` | drum 1 | 0 to 127 | 63 | pan |
| CC 96 | `pan2` | drum 2 | 0 to 127 | 63 | pan |
| CC 97 | `pan3` | drum 3 | 0 to 127 | 63 | pan |
| CC 100 | `pan4` | snare | 0 to 127 | 63 | pan |
| CC 101 | `pan5` | cymbal | 0 to 127 | 63 | pan |
| CC 102 | `pan6` | hi-hat | 0 to 127 | 63 | pan |
| CC 103 | `drive1` | drum 1 | 0 to 127 | 63 | drive |
| CC 104 | `drive2` | drum 2 | 0 to 127 | 63 | drive |
| CC 105 | `drive3` | drum 3 | 0 to 127 | 63 | drive |
| CC 106 | `snare_distortion` | snare | 0 to 127 | 63 | drive |
| CC 107 | `cymbal_distortion` | cymbal | 0 to 127 | 63 | drive |
| CC 108 | `hat_distortion` | hi-hat | 0 to 127 | 63 | drive |
| CC 109 | `voice_decimation1` | drum 1 | 0 to 127 | 127 | sample-rate reduction |
| CC 110 | `voice_decimation2` | drum 2 | 0 to 127 | 127 | sample-rate reduction |
| CC 111 | `voice_decimation3` | drum 3 | 0 to 127 | 127 | sample-rate reduction |
| CC 112 | `voice_decimation4` | snare | 0 to 127 | 127 | sample-rate reduction |
| CC 113 | `voice_decimation5` | cymbal | 0 to 127 | 127 | sample-rate reduction |
| CC 114 | `voice_decimation6` | hi-hat | 0 to 127 | 127 | sample-rate reduction |
| CC 115 | `voice_decimation_all` | all | 0 to 127 | 127 | sample-rate reduction, all voices |
| CC 116 | `freq_lfo1` | drum 1 | 0 to 127 | 0 | LFO rate |
| CC 117 | `freq_lfo2` | drum 2 | 0 to 127 | 0 | LFO rate |
| CC 118 | `freq_lfo3` | drum 3 | 0 to 127 | 0 | LFO rate |
| CC 119 | `freq_lfo4` | snare | 0 to 127 | 0 | LFO rate |
| CC 120 | `freq_lfo5` | cymbal | 0 to 127 | 0 | LFO rate |
| CC 121 | `freq_lfo6` | hi-hat | 0 to 127 | 0 | LFO rate |
| CC 122 | `amount_lfo1` | drum 1 | 0 to 127 | 0 | LFO amount |
| CC 123 | `amount_lfo2` | drum 2 | 0 to 127 | 0 | LFO amount |
| CC 124 | `amount_lfo3` | drum 3 | 0 to 127 | 0 | LFO amount |
| CC 125 | `amount_lfo4` | snare | 0 to 127 | 0 | LFO amount |
| CC 126 | `amount_lfo5` | cymbal | 0 to 127 | 0 | LFO amount |
| CC 127 | `amount_lfo6` | hi-hat | 0 to 127 | 0 | LFO amount |
| NRPN 0 | `filter_drive_1` | drum 1 | 0 to 127 | 0 | filter drive |
| NRPN 1 | `filter_drive_2` | drum 2 | 0 to 127 | 0 | filter drive |
| NRPN 2 | `filter_drive_3` | drum 3 | 0 to 127 | 0 | filter drive |
| NRPN 3 | `filter_drive_4` | snare | 0 to 127 | 0 | filter drive |
| NRPN 4 | `filter_drive_5` | cymbal | 0 to 127 | 0 | filter drive |
| NRPN 5 | `filter_drive_6` | hi-hat | 0 to 127 | 0 | filter drive |
| NRPN 6 | `mix_mod_1` | drum 1 | 0=FM 1=Mix | FM | modulator mode: FM, or mixed with the oscillator |
| NRPN 7 | `mix_mod_2` | drum 2 | 0=FM 1=Mix | FM | modulator mode: FM, or mixed with the oscillator |
| NRPN 8 | `mix_mod_3` | drum 3 | 0=FM 1=Mix | FM | modulator mode: FM, or mixed with the oscillator |
| NRPN 9 | `volume_mod_on_off1` | drum 1 | 0 to 1 | 0 | velocity controls the volume (0 off, 1 on) |
| NRPN 10 | `volume_mod_on_off2` | drum 2 | 0 to 1 | 0 | velocity controls the volume (0 off, 1 on) |
| NRPN 11 | `volume_mod_on_off3` | drum 3 | 0 to 1 | 0 | velocity controls the volume (0 off, 1 on) |
| NRPN 12 | `volume_mod_on_off4` | snare | 0 to 1 | 0 | velocity controls the volume (0 off, 1 on) |
| NRPN 13 | `volume_mod_on_off5` | cymbal | 0 to 1 | 0 | velocity controls the volume (0 off, 1 on) |
| NRPN 14 | `volume_mod_on_off6` | hi-hat | 0 to 1 | 0 | velocity controls the volume (0 off, 1 on) |
| NRPN 15 | `velo_mod_amt_1` | drum 1 | 0 to 127 | 0 | velocity modulation amount |
| NRPN 16 | `velo_mod_amt_2` | drum 2 | 0 to 127 | 0 | velocity modulation amount |
| NRPN 17 | `velo_mod_amt_3` | drum 3 | 0 to 127 | 0 | velocity modulation amount |
| NRPN 18 | `velo_mod_amt_4` | snare | 0 to 127 | 0 | velocity modulation amount |
| NRPN 19 | `velo_mod_amt_5` | cymbal | 0 to 127 | 0 | velocity modulation amount |
| NRPN 20 | `velo_mod_amt_6` | hi-hat | 0 to 127 | 0 | velocity modulation amount |
| NRPN 21 | `vel_dest_1` | drum 1 | 0 to 228 | none | velocity modulation destination: index into the modulation target list (see below) |
| NRPN 22 | `vel_dest_2` | drum 2 | 0 to 228 | none | velocity modulation destination: index into the modulation target list (see below) |
| NRPN 23 | `vel_dest_3` | drum 3 | 0 to 228 | none | velocity modulation destination: index into the modulation target list (see below) |
| NRPN 24 | `vel_dest_4` | snare | 0 to 228 | none | velocity modulation destination: index into the modulation target list (see below) |
| NRPN 25 | `vel_dest_5` | cymbal | 0 to 228 | none | velocity modulation destination: index into the modulation target list (see below) |
| NRPN 26 | `vel_dest_6` | hi-hat | 0 to 228 | none | velocity modulation destination: index into the modulation target list (see below) |
| NRPN 27 | `wave_lfo1` | drum 1 | 0=sin 1=tri 2=sup 3=sdn 4=sqr 5=rnd 6=xup 7=xdn | sin | LFO waveform |
| NRPN 28 | `wave_lfo2` | drum 2 | 0=sin 1=tri 2=sup 3=sdn 4=sqr 5=rnd 6=xup 7=xdn | sin | LFO waveform |
| NRPN 29 | `wave_lfo3` | drum 3 | 0=sin 1=tri 2=sup 3=sdn 4=sqr 5=rnd 6=xup 7=xdn | sin | LFO waveform |
| NRPN 30 | `wave_lfo4` | snare | 0=sin 1=tri 2=sup 3=sdn 4=sqr 5=rnd 6=xup 7=xdn | sin | LFO waveform |
| NRPN 31 | `wave_lfo5` | cymbal | 0=sin 1=tri 2=sup 3=sdn 4=sqr 5=rnd 6=xup 7=xdn | sin | LFO waveform |
| NRPN 32 | `wave_lfo6` | hi-hat | 0=sin 1=tri 2=sup 3=sdn 4=sqr 5=rnd 6=xup 7=xdn | sin | LFO waveform |
| NRPN 33 | `voice_lfo1` | drum 1 | 0 to 127 | 1 | no effect (the LFO destination already selects the voice) |
| NRPN 34 | `voice_lfo2` | drum 2 | 0 to 127 | 1 | no effect (the LFO destination already selects the voice) |
| NRPN 35 | `voice_lfo3` | drum 3 | 0 to 127 | 1 | no effect (the LFO destination already selects the voice) |
| NRPN 36 | `voice_lfo4` | snare | 0 to 127 | 1 | no effect (the LFO destination already selects the voice) |
| NRPN 37 | `voice_lfo5` | cymbal | 0 to 127 | 1 | no effect (the LFO destination already selects the voice) |
| NRPN 38 | `voice_lfo6` | hi-hat | 0 to 127 | 1 | no effect (the LFO destination already selects the voice) |
| NRPN 39 | `target_lfo1` | drum 1 | 0 to 228 | none | LFO destination: index into the modulation target list (see below) |
| NRPN 40 | `target_lfo2` | drum 2 | 0 to 228 | none | LFO destination: index into the modulation target list (see below) |
| NRPN 41 | `target_lfo3` | drum 3 | 0 to 228 | none | LFO destination: index into the modulation target list (see below) |
| NRPN 42 | `target_lfo4` | snare | 0 to 228 | none | LFO destination: index into the modulation target list (see below) |
| NRPN 43 | `target_lfo5` | cymbal | 0 to 228 | none | LFO destination: index into the modulation target list (see below) |
| NRPN 44 | `target_lfo6` | hi-hat | 0 to 228 | none | LFO destination: index into the modulation target list (see below) |
| NRPN 45 | `retrigger_lfo1` | drum 1 | 0=off 1=v1 2=v2 3=v3 4=v4 5=v5 6=v6 | off | LFO retrigger |
| NRPN 46 | `retrigger_lfo2` | drum 2 | 0=off 1=v1 2=v2 3=v3 4=v4 5=v5 6=v6 | off | LFO retrigger |
| NRPN 47 | `retrigger_lfo3` | drum 3 | 0=off 1=v1 2=v2 3=v3 4=v4 5=v5 6=v6 | off | LFO retrigger |
| NRPN 48 | `retrigger_lfo4` | snare | 0=off 1=v1 2=v2 3=v3 4=v4 5=v5 6=v6 | off | LFO retrigger |
| NRPN 49 | `retrigger_lfo5` | cymbal | 0=off 1=v1 2=v2 3=v3 4=v4 5=v5 6=v6 | off | LFO retrigger |
| NRPN 50 | `retrigger_lfo6` | hi-hat | 0=off 1=v1 2=v2 3=v3 4=v4 5=v5 6=v6 | off | LFO retrigger |
| NRPN 57 | `offset_lfo1` | drum 1 | 0 to 127 | 0 | LFO start phase |
| NRPN 58 | `offset_lfo2` | drum 2 | 0 to 127 | 0 | LFO start phase |
| NRPN 59 | `offset_lfo3` | drum 3 | 0 to 127 | 0 | LFO start phase |
| NRPN 60 | `offset_lfo4` | snare | 0 to 127 | 0 | LFO start phase |
| NRPN 61 | `offset_lfo5` | cymbal | 0 to 127 | 0 | LFO start phase |
| NRPN 62 | `offset_lfo6` | hi-hat | 0 to 127 | 0 | LFO start phase |
| NRPN 63 | `filter_type_1` | drum 1 | 0=LP 1=HP 2=BP 3=UBP 4=Nch 5=Pek 6=LP2 7=off | LP | filter type |
| NRPN 64 | `filter_type_2` | drum 2 | 0=LP 1=HP 2=BP 3=UBP 4=Nch 5=Pek 6=LP2 7=off | LP | filter type |
| NRPN 65 | `filter_type_3` | drum 3 | 0=LP 1=HP 2=BP 3=UBP 4=Nch 5=Pek 6=LP2 7=off | LP | filter type |
| NRPN 66 | `filter_type_4` | snare | 0=LP 1=HP 2=BP 3=UBP 4=Nch 5=Pek 6=LP2 7=off | LP | filter type |
| NRPN 67 | `filter_type_5` | cymbal | 0=LP 1=HP 2=BP 3=UBP 4=Nch 5=Pek 6=LP2 7=off | HP | filter type |
| NRPN 68 | `filter_type_6` | hi-hat | 0=LP 1=HP 2=BP 3=UBP 4=Nch 5=Pek 6=LP2 7=off | HP | filter type |
| NRPN 69 | `trans1_vol` | drum 1 | 0 to 127 | 0 | transient level |
| NRPN 70 | `trans2_vol` | drum 2 | 0 to 127 | 0 | transient level |
| NRPN 71 | `trans3_vol` | drum 3 | 0 to 127 | 0 | transient level |
| NRPN 72 | `trans4_vol` | snare | 0 to 127 | 0 | transient level |
| NRPN 73 | `trans5_vol` | cymbal | 0 to 127 | 0 | transient level |
| NRPN 74 | `trans6_vol` | hi-hat | 0 to 127 | 0 | transient level |
| NRPN 75 | `trans1_wave` | drum 1 | 0=Snp 1=Ofs 2=Clk 3=Ck2 4=Tik 5=Kik 6=Rim 7=Drp 8=Hat 9=Clp 10=Kk2 11=Snr 12=Tom 13=Sp2 | Snp | transient sample |
| NRPN 76 | `trans2_wave` | drum 2 | 0=Snp 1=Ofs 2=Clk 3=Ck2 4=Tik 5=Kik 6=Rim 7=Drp 8=Hat 9=Clp 10=Kk2 11=Snr 12=Tom 13=Sp2 | Snp | transient sample |
| NRPN 77 | `trans3_wave` | drum 3 | 0=Snp 1=Ofs 2=Clk 3=Ck2 4=Tik 5=Kik 6=Rim 7=Drp 8=Hat 9=Clp 10=Kk2 11=Snr 12=Tom 13=Sp2 | Snp | transient sample |
| NRPN 78 | `trans4_wave` | snare | 0=Snp 1=Ofs 2=Clk 3=Ck2 4=Tik 5=Kik 6=Rim 7=Drp 8=Hat 9=Clp 10=Kk2 11=Snr 12=Tom 13=Sp2 | Snp | transient sample |
| NRPN 79 | `trans5_wave` | cymbal | 0=Snp 1=Ofs 2=Clk 3=Ck2 4=Tik 5=Kik 6=Rim 7=Drp 8=Hat 9=Clp 10=Kk2 11=Snr 12=Tom 13=Sp2 | Snp | transient sample |
| NRPN 80 | `trans6_wave` | hi-hat | 0=Snp 1=Ofs 2=Clk 3=Ck2 4=Tik 5=Kik 6=Rim 7=Drp 8=Hat 9=Clp 10=Kk2 11=Snr 12=Tom 13=Sp2 | Snp | transient sample |
| NRPN 81 | `trans1_freq` | drum 1 | 0 to 127 | 0 | transient pitch |
| NRPN 82 | `trans2_freq` | drum 2 | 0 to 127 | 0 | transient pitch |
| NRPN 83 | `trans3_freq` | drum 3 | 0 to 127 | 0 | transient pitch |
| NRPN 84 | `trans4_freq` | snare | 0 to 127 | 0 | transient pitch |
| NRPN 85 | `trans5_freq` | cymbal | 0 to 127 | 0 | transient pitch |
| NRPN 86 | `trans6_freq` | hi-hat | 0 to 127 | 0 | transient pitch |
| NRPN 87 | `audio_out1` | drum 1 | 0=St1 1=St2 2=L1 3=R1 4=L2 5=R2 6=FX | St1 | output: St1 main stereo out, L1/R1 left or right only, FX through the effect; St2, L2 and R2 play on the main out |
| NRPN 88 | `audio_out2` | drum 2 | 0=St1 1=St2 2=L1 3=R1 4=L2 5=R2 6=FX | St1 | output: St1 main stereo out, L1/R1 left or right only, FX through the effect; St2, L2 and R2 play on the main out |
| NRPN 89 | `audio_out3` | drum 3 | 0=St1 1=St2 2=L1 3=R1 4=L2 5=R2 6=FX | St1 | output: St1 main stereo out, L1/R1 left or right only, FX through the effect; St2, L2 and R2 play on the main out |
| NRPN 90 | `audio_out4` | snare | 0=St1 1=St2 2=L1 3=R1 4=L2 5=R2 6=FX | St1 | output: St1 main stereo out, L1/R1 left or right only, FX through the effect; St2, L2 and R2 play on the main out |
| NRPN 91 | `audio_out5` | cymbal | 0=St1 1=St2 2=L1 3=R1 4=L2 5=R2 6=FX | St1 | output: St1 main stereo out, L1/R1 left or right only, FX through the effect; St2, L2 and R2 play on the main out |
| NRPN 92 | `audio_out6` | hi-hat | 0=St1 1=St2 2=L1 3=R1 4=L2 5=R2 6=FX | St1 | output: St1 main stereo out, L1/R1 left or right only, FX through the effect; St2, L2 and R2 play on the main out |
| NRPN 100 | `pwm_1` | drum 1 | 0 to 127 | 0 | pulse width (PWM waveform) |
| NRPN 101 | `pwm_2` | drum 2 | 0 to 127 | 0 | pulse width (PWM waveform) |
| NRPN 102 | `pwm_3` | drum 3 | 0 to 127 | 0 | pulse width (PWM waveform) |
| NRPN 103 | `pwm_4` | snare | 0 to 127 | 0 | pulse width (PWM waveform) |
| NRPN 104 | `pwm_5` | cymbal | 0 to 127 | 0 | pulse width (PWM waveform) |
| NRPN 105 | `pwm_6` | hi-hat | 0 to 127 | 0 | pulse width (PWM waveform) |
| NRPN 106 | `fx_type` | all | 0=off 1=drv 2=rng 3=cmp 4=del | off | effect |
| NRPN 107 | `fx_routing` | all | 0=St1 1=St2 2=L1 3=R1 4=L2 5=R2 | St1 | effect output (as for the voices' output) |
| NRPN 108 | `fx_dry_wet` | all | 0 to 100 | 0 | effect dry/wet (0 to 100) |
| NRPN 109 | `fx_dist_type` | all | 0=tub 1=fld 2=clp | tub | distortion type |
| NRPN 110 | `fx_p1` | all | 0 to 127 | 0 | effect parameter 1: drv drive, rng frequency, cmp attack, del time |
| NRPN 111 | `fx_p2` | all | 0 to 127 | 0 | effect parameter 2: drv shape 1, cmp release, del time range |
| NRPN 112 | `fx_p3` | all | 0 to 127 | 0 | effect parameter 3: drv shape 2, cmp threshold, del filter |
| NRPN 113 | `fx_p4` | all | 0 to 127 | 0 | effect parameter 4: drv shape 3, cmp make-up gain, del feedback |
| NRPN 114 | `fx_ratio` | all | 0=1:1 1=2:1 2=3:1 3=4:1 4=6:1 5=8:1 | 1:1 | compressor ratio |
| NRPN 115 | `fx_wave` | all | 0=Sin 1=Tri 2=Saw 3=Rec 4=Noi 5=PWM | Sin | ring modulator waveform |
| NRPN 116 | `fx_reverb_type` | all | 0=Plt | Plt | no effect (this firmware has no reverb) |
| NRPN 117 | `fx_delay_type` | all | 0=Del 1=Pp | Del | delay type |
<!-- midi-map:end -->

The velocity and LFO destinations (`vel_dest_1` to `vel_dest_6`, `target_lfo1` to `target_lfo6`) are an index into
the modulation target list below; the console's `get` shows the target's name. Index 0 turns the
modulation off.

<!-- mod-targets:begin -->
0 `none`, 1 `voice_decimation_all`

2 `coarse1`, 3 `fine1`, 4 `osc_wave_drum1`, 5 `pwm_1`, 6 `veloa1`, 7 `velod1`, 8 `vol_slope1`, 9 `mod_eg1`, 10 `pitch_slope1`, 11 `modamnt1`, 12 `vel_dest_1`, 13 `velo_mod_amt_1`, 14 `volume_mod_on_off1`, 15 `fmamnt1`, 16 `fm_freq1`, 17 `mod_wave_drum1`, 18 `mix_mod_1`, 19 `trans1_wave`, 20 `trans1_vol`, 21 `trans1_freq`, 22 `filter_freq_1`, 23 `reso_1`, 24 `filter_type_1`, 25 `filter_drive_1`, 26 `freq_lfo1`, 27 `sync_lfo1`, 28 `amount_lfo1`, 29 `wave_lfo1`, 30 `retrigger_lfo1`, 31 `offset_lfo1`, 32 `vol1`, 33 `pan1`, 34 `voice_decimation1`, 35 `drive1`, 36 `fx_p1`, 37 `fx_p2`, 38 `fx_p3`, 39 `fx_p4`

40 `coarse2`, 41 `fine2`, 42 `osc_wave_drum2`, 43 `pwm_2`, 44 `veloa2`, 45 `velod2`, 46 `vol_slope2`, 47 `mod_eg2`, 48 `pitch_slope2`, 49 `modamnt2`, 50 `vel_dest_2`, 51 `velo_mod_amt_2`, 52 `volume_mod_on_off2`, 53 `fmamnt2`, 54 `fm_freq2`, 55 `mod_wave_drum2`, 56 `mix_mod_2`, 57 `trans2_wave`, 58 `trans2_vol`, 59 `trans2_freq`, 60 `filter_freq_2`, 61 `reso_2`, 62 `filter_type_2`, 63 `filter_drive_2`, 64 `freq_lfo2`, 65 `sync_lfo2`, 66 `amount_lfo2`, 67 `wave_lfo2`, 68 `retrigger_lfo2`, 69 `offset_lfo2`, 70 `vol2`, 71 `pan2`, 72 `voice_decimation2`, 73 `drive2`, 74 `fx_p1`, 75 `fx_p2`, 76 `fx_p3`, 77 `fx_p4`

78 `coarse3`, 79 `fine3`, 80 `osc_wave_drum3`, 81 `pwm_3`, 82 `veloa3`, 83 `velod3`, 84 `vol_slope3`, 85 `mod_eg3`, 86 `pitch_slope3`, 87 `modamnt3`, 88 `vel_dest_3`, 89 `velo_mod_amt_3`, 90 `volume_mod_on_off3`, 91 `fmamnt3`, 92 `fm_freq3`, 93 `mod_wave_drum3`, 94 `mix_mod_3`, 95 `trans3_wave`, 96 `trans3_vol`, 97 `trans3_freq`, 98 `filter_freq_3`, 99 `reso_3`, 100 `filter_type_3`, 101 `filter_drive_3`, 102 `freq_lfo3`, 103 `sync_lfo3`, 104 `amount_lfo3`, 105 `wave_lfo3`, 106 `retrigger_lfo3`, 107 `offset_lfo3`, 108 `vol3`, 109 `pan3`, 110 `voice_decimation3`, 111 `drive3`, 112 `fx_p1`, 113 `fx_p2`, 114 `fx_p3`, 115 `fx_p4`

116 `coarse4`, 117 `fine4`, 118 `noise_freq1`, 119 `mix1`, 120 `osc_wave_snare`, 121 `pwm_4`, 122 `veloa4`, 123 `velod4`, 124 `repeat4`, 125 `vol_slope4`, 126 `mod_eg4`, 127 `pitch_slope4`, 128 `modamnt4`, 129 `vel_dest_4`, 130 `velo_mod_amt_4`, 131 `volume_mod_on_off4`, 132 `trans4_wave`, 133 `trans4_vol`, 134 `trans4_freq`, 135 `filter_freq_4`, 136 `reso_4`, 137 `filter_type_4`, 138 `filter_drive_4`, 139 `freq_lfo4`, 140 `sync_lfo4`, 141 `amount_lfo4`, 142 `wave_lfo4`, 143 `retrigger_lfo4`, 144 `offset_lfo4`, 145 `vol4`, 146 `pan4`, 147 `voice_decimation4`, 148 `snare_distortion`, 149 `fx_p1`, 150 `fx_p2`, 151 `fx_p3`, 152 `fx_p4`

153 `coarse5`, 154 `fine5`

155 `wave1_cym`, 156 `pwm_5`, 157 `veloa5`, 158 `velod5`, 159 `repeat5`, 160 `vol_slope5`, 161 `vel_dest_5`, 162 `velo_mod_amt_5`, 163 `volume_mod_on_off5`, 164 `mod_osc_f1_cym`, 165 `mod_osc_f2_cym`, 166 `mod_osc_gain1_cym`, 167 `mod_osc_gain2_cym`, 168 `wave2_cym`, 169 `wave3_cym`, 170 `trans5_wave`, 171 `trans5_vol`, 172 `trans5_freq`, 173 `filter_freq_5`, 174 `reso_5`, 175 `filter_type_5`, 176 `filter_drive_5`, 177 `freq_lfo5`, 178 `sync_lfo5`, 179 `amount_lfo5`, 180 `wave_lfo5`, 181 `retrigger_lfo5`, 182 `offset_lfo5`, 183 `vol5`, 184 `pan5`, 185 `voice_decimation5`, 186 `cymbal_distortion`, 187 `fx_p1`, 188 `fx_p2`, 189 `fx_p3`, 190 `fx_p4`

191 `coarse6`, 192 `fine6`

193 `wave1_hh`, 194 `pwm_6`, 195 `veloa6`, 196 `velod6_closed`, 197 `velod6_open`, 198 `vol_slope6`, 199 `vel_dest_6`, 200 `velo_mod_amt_6`, 201 `volume_mod_on_off6`, 202 `mod_osc_f1`, 203 `mod_osc_f2`, 204 `mod_osc_gain1`, 205 `mod_osc_gain2`, 206 `wave2_hh`, 207 `wave3_hh`, 208 `trans6_wave`, 209 `trans6_vol`, 210 `trans6_freq`, 211 `filter_freq_6`, 212 `reso_6`, 213 `filter_type_6`, 214 `filter_drive_6`, 215 `freq_lfo6`, 216 `sync_lfo6`, 217 `amount_lfo6`, 218 `wave_lfo6`, 219 `retrigger_lfo6`, 220 `offset_lfo6`, 221 `vol6`, 222 `pan6`, 223 `voice_decimation6`, 224 `hat_distortion`, 225 `fx_p1`, 226 `fx_p2`, 227 `fx_p3`, 228 `fx_p4`
<!-- mod-targets:end -->

After a change to the parameter table, regenerate both lists with `host/scripts/gen_midi_map.py`.

## Web UI

`web/` holds a browser page for sound design. It shows every voice and master FX parameter as a
control, plays a test note, keeps a library of sounds in the browser (with file import and export),
and can send the whole sound to the module. Changes are sent as the same CC and NRPN messages
described in [MIDI implementation](#midi-implementation), so the module needs no extra firmware
support beyond the store command.

Connection. Wire a computer MIDI interface (USB to DIN or TRS) to the module's TRS input as described
in [Hardware](#hardware): the interface's MIDI out goes to the TRS socket. In the page, choose that
interface as the MIDI output.

The link is one way. The module has no MIDI output, so the page cannot read parameters, preset slots
or connection state from it. The page keeps its own copy of the sound and shows what it last sent;
use "Send all" to bring the module in line with it. Sounds loaded from the module's own slots with
the console are not visible to the page.

"Seal into boot slot" sends the store command (NRPN 16128, value 0x53) on drum 1's channel. The module
saves the sound it is playing now to the slot that is loaded at power-up, keeps that slot's name, and
plays it after the next power-up.

Preset importer. The "Preset importer" button opens a drawer where you pick a kit folder (or several
`.SND` files). The drawer lists the kits it finds, and selecting one makes it the current sound and
sends all its values live to the module. Nothing is stored on the module: after a power-cycle it plays
its boot slot again, and "Seal into boot slot" is still the only way to keep a kit. Files that are not
`.SND` kits, such as `.PAT`, `.SNG`, `.CFG` and `.NFO`, are ignored and only counted.

Building and serving (tested with Node.js 24):

```sh
cd web
npm ci
npm run build     # writes web/dist/
npm run preview   # serves it at http://127.0.0.1:4173/
```

`npm test` runs the page's tests and `npm run typecheck` checks the types. Web MIDI works only on
`https://` pages and on `localhost`, so open the page from the preview server or from an HTTPS host,
not as a `file://` file.

Browsers. Chrome, Edge and Opera support Web MIDI and allow the page to use the MIDI interface after a
permission prompt. Other browsers can still edit sounds and use the library and file export, but
cannot send to the module.

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
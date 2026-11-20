/*
 * param_table.c: metadata for every engine parameter (generated once by
 * host/scripts/gen_param_table.py from the old STM32 menu data, then maintained by hand).
 *
 * Copyright (C) 2012-2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "lxr/param_info.h"
#include <string.h>

static const char *const enum_delayNames[] = {
	"Del",
	"Pp",
};

static const char *const enum_distNames[] = {
	"tub",
	"fld",
	"clp",
};

static const char *const enum_filterTypes[] = {
	"LP",
	"HP",
	"BP",
	"UBP",
	"Nch",
	"Pek",
	"LP2",
	"off",
};

static const char *const enum_fxNames[] = {
	"off",
	"drv",
	"rng",
	"cmp",
	"del",
};

static const char *const enum_lfoWaveNames[] = {
	"sin",
	"tri",
	"sup",
	"sdn",
	"sqr",
	"rnd",
	"xup",
	"xdn",
};

static const char *const enum_midiFilterNames[] = {
	"off",
	"N",
	"R",
	"RN",
	"C",
	"CN",
	"CR",
	"CRN",
	"P",
	"PN",
	"PR",
	"PRN",
	"PC",
	"PCN",
	"PCR",
	"all",
};

static const char *const enum_mixFmNames[] = {
	"FM",
	"Mix",
};

static const char *const enum_outputNames[] = {
	"St1",
	"St2",
	"L1",
	"R1",
	"L2",
	"R2",
	"FX",
};

static const char *const enum_outputNamesFx[] = {
	"St1",
	"St2",
	"L1",
	"R1",
	"L2",
	"R2",
};

static const char *const enum_ratioNames[] = {
	"1:1",
	"2:1",
	"3:1",
	"4:1",
	"6:1",
	"8:1",
};

static const char *const enum_retriggerNames[] = {
	"off",
	"v1",
	"v2",
	"v3",
	"v4",
	"v5",
	"v6",
};

static const char *const enum_reverbNames[] = {
	"Plt",
};

static const char *const enum_transientNames[] = {
	"Snp",
	"Ofs",
	"Clk",
	"Ck2",
	"Tik",
	"Kik",
	"Rim",
	"Drp",
	"Hat",
	"Clp",
	"Kk2",
	"Snr",
	"Tom",
	"Sp2",
};

static const char *const enum_waveformNames[] = {
	"Sin",
	"Tri",
	"Saw",
	"Rec",
	"Noi",
	"PWM",
};

static const lxr_param_info_t paramTable[] = {
	{ 1, "osc_wave_drum1", 0, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 2, "osc_wave_drum2", 1, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 3, "osc_wave_drum3", 2, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 4, "osc_wave_snare", 3, LXR_KIND_ENUM, 0, 5, 1, enum_waveformNames },
	{ 6, "wave1_cym", 4, LXR_KIND_ENUM, 0, 5, 4, enum_waveformNames },
	{ 7, "wave1_hh", 5, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 8, "coarse1", 0, LXR_KIND_UINT8, 0, 127, 31, NULL },
	{ 9, "fine1", 0, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 10, "coarse2", 1, LXR_KIND_UINT8, 0, 127, 41, NULL },
	{ 11, "fine2", 1, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 12, "coarse3", 2, LXR_KIND_UINT8, 0, 127, 58, NULL },
	{ 13, "fine3", 2, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 14, "coarse4", 3, LXR_KIND_UINT8, 0, 127, 45, NULL },
	{ 15, "fine4", 3, LXR_KIND_UINT8, 0, 127, 64, NULL },
	{ 16, "coarse5", 4, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 17, "fine5", 4, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 18, "coarse6", 5, LXR_KIND_UINT8, 0, 127, 50, NULL },
	{ 19, "fine6", 5, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 20, "mod_wave_drum1", 0, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 21, "mod_wave_drum2", 1, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 22, "mod_wave_drum3", 2, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 23, "wave2_cym", 4, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 24, "wave3_cym", 4, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 25, "wave2_hh", 5, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 26, "wave3_hh", 5, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 27, "noise_freq1", 0, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 28, "mix1", 0, LXR_KIND_UINT8, 0, 127, 61, NULL },
	{ 29, "mod_osc_f1_cym", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 30, "mod_osc_f2_cym", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 31, "mod_osc_gain1_cym", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 32, "mod_osc_gain2_cym", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 33, "mod_osc_f1", 0, LXR_KIND_UINT8, 0, 127, 56, NULL },
	{ 34, "mod_osc_f2", 1, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 35, "mod_osc_gain1", 0, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 36, "mod_osc_gain2", 1, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 37, "filter_freq_1", 0, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 38, "filter_freq_2", 1, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 39, "filter_freq_3", 2, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 40, "filter_freq_4", 3, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 41, "filter_freq_5", 4, LXR_KIND_UINT8, 0, 127, 68, NULL },
	{ 42, "filter_freq_6", 5, LXR_KIND_UINT8, 0, 127, 104, NULL },
	{ 43, "reso_1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 44, "reso_2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 45, "reso_3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 46, "reso_4", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 47, "reso_5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 48, "reso_6", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 49, "veloa1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 50, "velod1", 0, LXR_KIND_UINT8, 0, 127, 21, NULL },
	{ 51, "veloa2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 52, "velod2", 1, LXR_KIND_UINT8, 0, 127, 13, NULL },
	{ 53, "veloa3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 54, "velod3", 2, LXR_KIND_UINT8, 0, 127, 3, NULL },
	{ 55, "veloa4", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 56, "velod4", 3, LXR_KIND_UINT8, 0, 127, 10, NULL },
	{ 57, "veloa5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 58, "velod5", 4, LXR_KIND_UINT8, 0, 127, 107, NULL },
	{ 59, "veloa6", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 60, "velod6_closed", 5, LXR_KIND_UINT8, 0, 127, 5, NULL },
	{ 61, "velod6_open", 5, LXR_KIND_UINT8, 0, 127, 17, NULL },
	{ 62, "vol_slope1", 0, LXR_KIND_UINT8, 0, 127, 46, NULL },
	{ 63, "vol_slope2", 1, LXR_KIND_UINT8, 0, 127, 11, NULL },
	{ 64, "vol_slope3", 2, LXR_KIND_UINT8, 0, 127, 4, NULL },
	{ 65, "vol_slope4", 3, LXR_KIND_UINT8, 0, 127, 10, NULL },
	{ 66, "vol_slope5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 67, "vol_slope6", 5, LXR_KIND_UINT8, 0, 127, 6, NULL },
	{ 68, "repeat4", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 69, "repeat5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 70, "mod_eg1", 0, LXR_KIND_UINT8, 0, 127, 26, NULL },
	{ 71, "mod_eg2", 1, LXR_KIND_UINT8, 0, 127, 93, NULL },
	{ 72, "mod_eg3", 2, LXR_KIND_UINT8, 0, 127, 7, NULL },
	{ 73, "mod_eg4", 3, LXR_KIND_UINT8, 0, 127, 14, NULL },
	{ 74, "modamnt1", 0, LXR_KIND_UINT8, 0, 127, 44, NULL },
	{ 75, "modamnt2", 1, LXR_KIND_UINT8, 0, 127, 14, NULL },
	{ 76, "modamnt3", 2, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 77, "modamnt4", 3, LXR_KIND_UINT8, 0, 127, 81, NULL },
	{ 78, "pitch_slope1", 0, LXR_KIND_UINT8, 0, 127, 22, NULL },
	{ 79, "pitch_slope2", 1, LXR_KIND_UINT8, 0, 127, 10, NULL },
	{ 80, "pitch_slope3", 2, LXR_KIND_UINT8, 0, 127, 14, NULL },
	{ 81, "pitch_slope4", 3, LXR_KIND_UINT8, 0, 127, 15, NULL },
	{ 82, "fmamnt1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 83, "fm_freq1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 84, "fmamnt2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 85, "fm_freq2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 86, "fmamnt3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 87, "fm_freq3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 88, "vol1", 0, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 89, "vol2", 1, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 90, "vol3", 2, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 91, "vol4", 3, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 92, "vol5", 4, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 93, "vol6", 5, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 94, "pan1", 0, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 95, "pan2", 1, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 96, "pan3", 2, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 99, "pan4", 3, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 100, "pan5", 4, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 101, "pan6", 5, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 102, "drive1", 0, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 103, "drive2", 1, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 104, "drive3", 2, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 105, "snare_distortion", 3, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 106, "cymbal_distortion", 4, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 107, "hat_distortion", 5, LXR_KIND_UINT8, 0, 127, 63, NULL },
	{ 108, "voice_decimation1", 0, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 109, "voice_decimation2", 1, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 110, "voice_decimation3", 2, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 111, "voice_decimation4", 3, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 112, "voice_decimation5", 4, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 113, "voice_decimation6", 5, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 114, "voice_decimation_all", -1, LXR_KIND_UINT8, 0, 127, 127, NULL },
	{ 115, "freq_lfo1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 116, "freq_lfo2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 117, "freq_lfo3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 118, "freq_lfo4", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 119, "freq_lfo5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 120, "freq_lfo6", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 121, "amount_lfo1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 122, "amount_lfo2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 123, "amount_lfo3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 124, "amount_lfo4", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 125, "amount_lfo5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 126, "amount_lfo6", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 128, "filter_drive_1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 129, "filter_drive_2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 130, "filter_drive_3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 131, "filter_drive_4", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 132, "filter_drive_5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 133, "filter_drive_6", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 134, "mix_mod_1", 0, LXR_KIND_ENUM, 0, 1, 0, enum_mixFmNames },
	{ 135, "mix_mod_2", 1, LXR_KIND_ENUM, 0, 1, 0, enum_mixFmNames },
	{ 136, "mix_mod_3", 2, LXR_KIND_ENUM, 0, 1, 0, enum_mixFmNames },
	{ 137, "volume_mod_on_off1", 0, LXR_KIND_UINT8, 0, 1, 0, NULL },
	{ 138, "volume_mod_on_off2", 1, LXR_KIND_UINT8, 0, 1, 0, NULL },
	{ 139, "volume_mod_on_off3", 2, LXR_KIND_UINT8, 0, 1, 0, NULL },
	{ 140, "volume_mod_on_off4", 3, LXR_KIND_UINT8, 0, 1, 0, NULL },
	{ 141, "volume_mod_on_off5", 4, LXR_KIND_UINT8, 0, 1, 0, NULL },
	{ 142, "volume_mod_on_off6", 5, LXR_KIND_UINT8, 0, 1, 0, NULL },
	{ 143, "velo_mod_amt_1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 144, "velo_mod_amt_2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 145, "velo_mod_amt_3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 146, "velo_mod_amt_4", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 147, "velo_mod_amt_5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 148, "velo_mod_amt_6", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 149, "vel_dest_1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 150, "vel_dest_2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 151, "vel_dest_3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 152, "vel_dest_4", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 153, "vel_dest_5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 154, "vel_dest_6", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 155, "wave_lfo1", 0, LXR_KIND_ENUM, 0, 7, 0, enum_lfoWaveNames },
	{ 156, "wave_lfo2", 1, LXR_KIND_ENUM, 0, 7, 0, enum_lfoWaveNames },
	{ 157, "wave_lfo3", 2, LXR_KIND_ENUM, 0, 7, 0, enum_lfoWaveNames },
	{ 158, "wave_lfo4", 3, LXR_KIND_ENUM, 0, 7, 0, enum_lfoWaveNames },
	{ 159, "wave_lfo5", 4, LXR_KIND_ENUM, 0, 7, 0, enum_lfoWaveNames },
	{ 160, "wave_lfo6", 5, LXR_KIND_ENUM, 0, 7, 0, enum_lfoWaveNames },
	{ 161, "voice_lfo1", 0, LXR_KIND_UINT8, 0, 127, 1, NULL },
	{ 162, "voice_lfo2", 1, LXR_KIND_UINT8, 0, 127, 1, NULL },
	{ 163, "voice_lfo3", 2, LXR_KIND_UINT8, 0, 127, 1, NULL },
	{ 164, "voice_lfo4", 3, LXR_KIND_UINT8, 0, 127, 1, NULL },
	{ 165, "voice_lfo5", 4, LXR_KIND_UINT8, 0, 127, 1, NULL },
	{ 166, "voice_lfo6", 5, LXR_KIND_UINT8, 0, 127, 1, NULL },
	{ 167, "target_lfo1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 168, "target_lfo2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 169, "target_lfo3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 170, "target_lfo4", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 171, "target_lfo5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 172, "target_lfo6", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 173, "retrigger_lfo1", 0, LXR_KIND_ENUM, 0, 6, 0, enum_retriggerNames },
	{ 174, "retrigger_lfo2", 1, LXR_KIND_ENUM, 0, 6, 0, enum_retriggerNames },
	{ 175, "retrigger_lfo3", 2, LXR_KIND_ENUM, 0, 6, 0, enum_retriggerNames },
	{ 176, "retrigger_lfo4", 3, LXR_KIND_ENUM, 0, 6, 0, enum_retriggerNames },
	{ 177, "retrigger_lfo5", 4, LXR_KIND_ENUM, 0, 6, 0, enum_retriggerNames },
	{ 178, "retrigger_lfo6", 5, LXR_KIND_ENUM, 0, 6, 0, enum_retriggerNames },
	{ 185, "offset_lfo1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 186, "offset_lfo2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 187, "offset_lfo3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 188, "offset_lfo4", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 189, "offset_lfo5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 190, "offset_lfo6", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 191, "filter_type_1", 0, LXR_KIND_ENUM, 0, 7, 0, enum_filterTypes },
	{ 192, "filter_type_2", 1, LXR_KIND_ENUM, 0, 7, 0, enum_filterTypes },
	{ 193, "filter_type_3", 2, LXR_KIND_ENUM, 0, 7, 0, enum_filterTypes },
	{ 194, "filter_type_4", 3, LXR_KIND_ENUM, 0, 7, 0, enum_filterTypes },
	{ 195, "filter_type_5", 4, LXR_KIND_ENUM, 0, 7, 1, enum_filterTypes },
	{ 196, "filter_type_6", 5, LXR_KIND_ENUM, 0, 7, 1, enum_filterTypes },
	{ 197, "trans1_vol", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 198, "trans2_vol", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 199, "trans3_vol", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 200, "trans4_vol", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 201, "trans5_vol", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 202, "trans6_vol", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 203, "trans1_wave", 0, LXR_KIND_ENUM, 0, 13, 0, enum_transientNames },
	{ 204, "trans2_wave", 1, LXR_KIND_ENUM, 0, 13, 0, enum_transientNames },
	{ 205, "trans3_wave", 2, LXR_KIND_ENUM, 0, 13, 0, enum_transientNames },
	{ 206, "trans4_wave", 3, LXR_KIND_ENUM, 0, 13, 0, enum_transientNames },
	{ 207, "trans5_wave", 4, LXR_KIND_ENUM, 0, 13, 0, enum_transientNames },
	{ 208, "trans6_wave", 5, LXR_KIND_ENUM, 0, 13, 0, enum_transientNames },
	{ 209, "trans1_freq", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 210, "trans2_freq", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 211, "trans3_freq", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 212, "trans4_freq", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 213, "trans5_freq", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 214, "trans6_freq", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 215, "audio_out1", 0, LXR_KIND_ENUM, 0, 6, 0, enum_outputNames },
	{ 216, "audio_out2", 1, LXR_KIND_ENUM, 0, 6, 0, enum_outputNames },
	{ 217, "audio_out3", 2, LXR_KIND_ENUM, 0, 6, 0, enum_outputNames },
	{ 218, "audio_out4", 3, LXR_KIND_ENUM, 0, 6, 0, enum_outputNames },
	{ 219, "audio_out5", 4, LXR_KIND_ENUM, 0, 6, 0, enum_outputNames },
	{ 220, "audio_out6", 5, LXR_KIND_ENUM, 0, 6, 0, enum_outputNames },
	{ 228, "pwm_1", 0, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 229, "pwm_2", 1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 230, "pwm_3", 2, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 231, "pwm_4", 3, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 232, "pwm_5", 4, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 233, "pwm_6", 5, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 234, "fx_type", -1, LXR_KIND_ENUM, 0, 4, 0, enum_fxNames },
	{ 235, "fx_routing", -1, LXR_KIND_ENUM, 0, 5, 0, enum_outputNamesFx },
	{ 236, "fx_dry_wet", -1, LXR_KIND_UINT8, 0, 100, 0, NULL },
	{ 237, "fx_dist_type", -1, LXR_KIND_ENUM, 0, 2, 0, enum_distNames },
	{ 238, "fx_p1", -1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 239, "fx_p2", -1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 240, "fx_p3", -1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 241, "fx_p4", -1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 242, "fx_ratio", -1, LXR_KIND_ENUM, 0, 5, 0, enum_ratioNames },
	{ 243, "fx_wave", -1, LXR_KIND_ENUM, 0, 5, 0, enum_waveformNames },
	{ 244, "fx_reverb_type", -1, LXR_KIND_ENUM, 0, 0, 0, enum_reverbNames },
	{ 245, "fx_delay_type", -1, LXR_KIND_ENUM, 0, 1, 0, enum_delayNames },
	{ 273, "midi_chan_1", -1, LXR_KIND_UINT8, 1, 16, 1, NULL },
	{ 274, "midi_chan_2", -1, LXR_KIND_UINT8, 1, 16, 2, NULL },
	{ 275, "midi_chan_3", -1, LXR_KIND_UINT8, 1, 16, 3, NULL },
	{ 276, "midi_chan_4", -1, LXR_KIND_UINT8, 1, 16, 4, NULL },
	{ 277, "midi_chan_5", -1, LXR_KIND_UINT8, 1, 16, 5, NULL },
	{ 278, "midi_chan_6", -1, LXR_KIND_UINT8, 1, 16, 6, NULL },
	{ 284, "midi_chan_7", -1, LXR_KIND_UINT8, 1, 16, 7, NULL },
	{ 286, "midi_filt_tx", -1, LXR_KIND_ENUM, 0, 15, 15, enum_midiFilterNames },
	{ 287, "midi_filt_rx", -1, LXR_KIND_ENUM, 0, 15, 15, enum_midiFilterNames },
	{ 293, "midi_chan_global", -1, LXR_KIND_UINT8, 0, 16, 0, NULL },
	{ 294, "midi_note1", -1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 295, "midi_note2", -1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 296, "midi_note3", -1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 297, "midi_note4", -1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 298, "midi_note5", -1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 299, "midi_note6", -1, LXR_KIND_UINT8, 0, 127, 0, NULL },
	{ 300, "midi_note7", -1, LXR_KIND_UINT8, 0, 127, 0, NULL },
};

#define LXR_PARAM_TABLE_SIZE (sizeof(paramTable) / sizeof(paramTable[0]))

uint16_t lxr_param_count(void)
{
	return (uint16_t)LXR_PARAM_TABLE_SIZE;
}

const lxr_param_info_t *lxr_param_info(uint16_t index)
{
	return index < LXR_PARAM_TABLE_SIZE ? &paramTable[index] : NULL;
}

const lxr_param_info_t *lxr_param_find_id(uint16_t id)
{
	/* The table is sorted by id. */
	uint16_t lo = 0, hi = (uint16_t)LXR_PARAM_TABLE_SIZE;
	while(lo < hi)
	{
		const uint16_t mid = (uint16_t)((lo + hi) / 2);
		if(paramTable[mid].id == id) return &paramTable[mid];
		if(paramTable[mid].id < id) lo = (uint16_t)(mid + 1); else hi = mid;
	}
	return NULL;
}

const lxr_param_info_t *lxr_param_find(const char *name)
{
	for(uint16_t i = 0; i < LXR_PARAM_TABLE_SIZE; i++)
	{
		if(strcmp(paramTable[i].name, name) == 0) return &paramTable[i];
	}
	return NULL;
}

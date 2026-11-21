/*
 * console.c: line-based text console UI (requirement R7, design section 5).
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#include "console.h"
#include "lxr/engine.h"
#include "lxr/preset.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

static const console_io_t *io;

/* ---- output queue: never blocks, drops characters when full (R7.7) ---- */

static char txBuf[CONSOLE_TX_SIZE];
static uint32_t txHead, txTail;
static uint32_t txDropped;

static void putChar(char c)
{
	if(txHead - txTail >= CONSOLE_TX_SIZE)
	{
		txDropped++;
		return;
	}
	txBuf[txHead++ & (CONSOLE_TX_SIZE - 1)] = c;
}

static void putStr(const char *s)
{
	while(*s)
		putChar(*s++);
}

static void out(const char *fmt, ...)
{
	char line[128];
	va_list ap;
	va_start(ap, fmt);
	vsnprintf(line, sizeof line, fmt, ap);
	va_end(ap);
	putStr(line);
}

static void drainOutput(void)
{
	while(txTail != txHead && io && io->write_char)
	{
		if(io->write_char(txBuf[txTail & (CONSOLE_TX_SIZE - 1)]) != 0)
			break;
		txTail++;
	}
}

uint32_t console_dropped_chars(void)
{
	return txDropped;
}

/* ---- voices ---- */

static const char *const voiceNames[LXR_NUM_VOICE_SLOTS] = { "d1", "d2", "d3", "snare", "cym", "hh", "hho" };

static int voiceFromName(const char *s)
{
	for(int i = 0; i < LXR_NUM_VOICE_SLOTS; i++)
		if(strcasecmp(s, voiceNames[i]) == 0) return i;
	return -1;
}

/* ---- parsing helpers ---- */

static int parseNumber(const char *s, long *v)
{
	char *end;
	if(!s || !*s) return -1;
	*v = strtol(s, &end, 10);
	return *end == '\0' ? 0 : -1;
}

static void printValue(const lxr_param_info_t *p, uint8_t v)
{
	if(p->kind == LXR_KIND_ENUM && p->enum_names && v <= p->max)
		out("%s=%u (%s)", p->name, v, p->enum_names[v]);
	else
		out("%s=%u", p->name, v);
}

/* ---- commands ---- */

static int watchOn;

static void printExtraHelp(void);

static void cmdHelp(void)
{
	putStr("commands:\r\n"
	       "  help                     this list\r\n"
	       "  params [voice|global]    list parameters (voices: d1 d2 d3 snare cym hh)\r\n"
	       "  get <param>              show a value\r\n"
	       "  set <param> <value>      change a value (number, or name for list values)\r\n"
	       "  trigger <voice> [vel]    play a voice (d1 d2 d3 snare cym hh hho), vel 1..127\r\n"
	       "  watch on|off             print every parameter change\r\n"
	       "  status [reset]           CPU, temperature and error counters (reset restarts worst/avg)\r\n"
	       "  bench [fx] [seconds]     full-load test: all voices every 46 ms, drum 1 into fx (default del 10)\r\n"
	       "  bench stop               end a running bench\r\n"
	       "  midi [reset]             MIDI input check: bytes, errors, line level, last bytes, note latency\r\n"
	       "  preset list              the 16 preset slots\r\n"
	       "  preset load <0-15>       load a slot (it also becomes the boot slot)\r\n"
	       "  preset save <0-15> [name] save the current sound and MIDI settings (name: 8 characters)\r\n");
	printExtraHelp();
}

static void cmdParams(const char *filter)
{
	int voice = -2; /* all */
	if(filter)
	{
		if(strcasecmp(filter, "global") == 0) voice = -1;
		else
		{
			voice = voiceFromName(filter);
			if(voice < 0 || voice > 5) { out("error: unknown voice '%s'\r\n", filter); return; }
		}
	}
	const uint16_t n = lxr_param_count();
	for(uint16_t i = 0; i < n; i++)
	{
		const lxr_param_info_t *p = lxr_param_info(i);
		if(voice != -2 && p->voice != voice) continue;
		uint8_t v = 0;
		lxr_param_get(p->id, &v);
		printValue(p, v);
		out("  [%u..%u]\r\n", p->min, p->max);
	}
}

static void cmdGet(const char *name)
{
	if(!name) { putStr("error: usage: get <param>\r\n"); return; }
	const lxr_param_info_t *p = lxr_param_find(name);
	if(!p) { out("error: unknown param '%s'\r\n", name); return; }
	uint8_t v = 0;
	lxr_param_get(p->id, &v);
	printValue(p, v);
	putStr("\r\n");
}

static void cmdSet(const char *name, const char *value)
{
	if(!name || !value) { putStr("error: usage: set <param> <value>\r\n"); return; }
	const lxr_param_info_t *p = lxr_param_find(name);
	if(!p) { out("error: unknown param '%s'\r\n", name); return; }

	long v;
	if(parseNumber(value, &v) != 0)
	{
		v = -1;
		if(p->kind == LXR_KIND_ENUM && p->enum_names)
		{
			for(unsigned i = p->min; i <= p->max; i++)
				if(strcasecmp(value, p->enum_names[i]) == 0) { v = (long)i; break; }
		}
		if(v < 0) { out("error: '%s' is not a value of %s\r\n", value, p->name); return; }
	}
	if(v < p->min || v > p->max)
	{
		out("error: value out of range %u..%u\r\n", p->min, p->max);
		return;
	}
	if(lxr_param_set(p->id, (uint8_t)v) != 0)
	{
		putStr("error: engine busy, try again\r\n");
		return;
	}
	if(!watchOn)
	{
		printValue(p, (uint8_t)v);
		putStr("\r\n");
	}
}

static void cmdTrigger(const char *voiceName, const char *vel)
{
	if(!voiceName) { putStr("error: usage: trigger <voice> [vel]\r\n"); return; }
	const int voice = voiceFromName(voiceName);
	if(voice < 0) { out("error: unknown voice '%s'\r\n", voiceName); return; }
	long v = 100;
	if(vel && (parseNumber(vel, &v) != 0 || v < 1 || v > 127))
	{
		putStr("error: velocity must be 1..127\r\n");
		return;
	}
	lxr_trigger((lxr_voice_t)voice, (uint8_t)v);
	putStr("ok\r\n");
}

static void cmdWatch(const char *arg)
{
	if(arg && strcasecmp(arg, "on") == 0) watchOn = 1;
	else if(arg && strcasecmp(arg, "off") == 0) watchOn = 0;
	else { putStr("error: usage: watch on|off\r\n"); return; }
	out("watch %s\r\n", watchOn ? "on" : "off");
}

static void cmdStatus(const char *arg)
{
	if(arg && strcasecmp(arg, "reset") == 0)
	{
		lxr_stats_reset();
		putStr("status reset: worst/avg Block time and underruns restart now\r\n");
		return;
	}
	lxr_stats_t s;
	lxr_get_stats(&s);
	out("blocks %lu  worst_block_us %lu  avg_block_us %lu  underruns %lu  midi_errors %lu  queue_drops %lu  console_drops %lu\r\n",
	    (unsigned long)s.blocks, (unsigned long)s.worst_block_us, (unsigned long)s.avg_block_us,
	    (unsigned long)s.underruns, (unsigned long)s.midi_errors, (unsigned long)s.queue_drops, (unsigned long)txDropped);
	out("cpu %u%%  last second: worst_block_us %lu  output peak %u (%s)\r\n", s.cpu_percent,
	    (unsigned long)s.recent_worst_block_us, s.out_peak, s.out_peak >= 32767 ? "clipping" : s.out_peak ? "ok" : "silent");
	if(s.sys_clock_khz)
		out("clock %lu kHz", (unsigned long)s.sys_clock_khz);
	if(s.temp_c_x10 != INT16_MIN)
		out("  temp %d.%d C", s.temp_c_x10 / 10, abs(s.temp_c_x10 % 10));
	if(s.sys_clock_khz || s.temp_c_x10 != INT16_MIN)
		putStr("\r\n");
}

/* ---- midi: input check ---- */

static void cmdMidi(const char *arg)
{
	if(arg && strcasecmp(arg, "reset") == 0)
	{
		lxr_stats_reset_latency();
		putStr("midi latency statistics restart with the next note\r\n");
		return;
	}
	lxr_stats_t s;
	lxr_get_stats(&s);
	out("midi bytes %lu  errors %lu  line %s  edges %lu\r\n", (unsigned long)s.midi_bytes, (unsigned long)s.midi_errors,
	    s.midi_line < 0 ? "unknown" : (s.midi_line ? "high (idle, ok)" : "LOW (check pull-up / wiring)"),
	    (unsigned long)s.midi_line_edges);
	out("regs %08lX %08lX %08lX\r\n", (unsigned long)s.midi_debug[0], (unsigned long)s.midi_debug[1], (unsigned long)s.midi_debug[2]);
	if(s.latency_count)
		out("notes %lu  latency (last input edge to): buffer min %lu avg %lu max %lu us, output min %lu avg %lu max %lu us (%lu notes)\r\n",
		    (unsigned long)s.midi_notes,
		    (unsigned long)s.latency_buffer_min_us, (unsigned long)s.latency_buffer_avg_us, (unsigned long)s.latency_buffer_max_us,
		    (unsigned long)s.latency_output_min_us, (unsigned long)s.latency_output_avg_us, (unsigned long)s.latency_output_max_us,
		    (unsigned long)s.latency_count);
	else
		out("notes %lu  latency: no measurement yet\r\n", (unsigned long)s.midi_notes);
	uint8_t log[16];
	const int n = lxr_get_midi_log(log);
	if(n == 0)
	{
		putStr("no bytes received yet\r\n");
		return;
	}
	putStr("last:");
	for(int i = 0; i < n; i++)
		out(" %02X", log[i]);
	putStr("\r\n");
}

/* ---- preset: list, load, save (task 12.2) ---- */

static const char *presetStatusText(int st)
{
	switch(st)
	{
		case LXR_PRESET_OK: return "ok";
		case LXR_PRESET_BLANK: return "empty";
		case LXR_PRESET_CORRUPT: return "corrupt";
		default: return "no storage";
	}
}

static int parseSlot(const char *s, uint8_t *slot)
{
	long v;
	if(parseNumber(s, &v) != 0 || v < 0 || v >= (long)LXR_PRESET_SLOTS)
	{
		out("error: slot must be 0..%u\r\n", LXR_PRESET_SLOTS - 1);
		return -1;
	}
	*slot = (uint8_t)v;
	return 0;
}

static void cmdPreset(const char *sub, const char *arg, const char *name)
{
	uint8_t slot;
	if(sub && strcasecmp(sub, "list") == 0)
	{
		const int current = lxr_preset_current();
		for(uint8_t i = 0; i < LXR_PRESET_SLOTS; i++)
		{
			char n[LXR_PRESET_NAME_LEN + 1];
			const int st = lxr_preset_name(i, n);
			out("%c%2u  %s\r\n", i == current ? '*' : ' ', i, st == LXR_PRESET_OK ? n : presetStatusText(st));
		}
		return;
	}
	if(sub && strcasecmp(sub, "load") == 0)
	{
		if(parseSlot(arg, &slot) != 0) return;
		const int st = lxr_preset_load(slot);
		if(st == LXR_PRESET_OK)
		{
			char n[LXR_PRESET_NAME_LEN + 1];
			lxr_preset_name(slot, n);
			out("loaded slot %u '%s'\r\n", slot, n);
		}
		else
			out("error: slot %u is %s, nothing loaded\r\n", slot, presetStatusText(st));
		return;
	}
	if(sub && strcasecmp(sub, "save") == 0)
	{
		if(parseSlot(arg, &slot) != 0) return;
		if(name && strlen(name) > LXR_PRESET_NAME_LEN)
		{
			out("error: name longer than %u characters\r\n", LXR_PRESET_NAME_LEN);
			return;
		}
		if(lxr_preset_save(slot, name) != 0)
		{
			putStr("error: no preset storage\r\n");
			return;
		}
		char n[LXR_PRESET_NAME_LEN + 1];
		lxr_preset_name(slot, n);
		lxr_stats_t s;
		lxr_get_stats(&s);
		out("saved slot %u '%s'", slot, n);
		if(s.flash_write_max_us)
			out(" (flash write %lu ms, longest %lu ms)", (unsigned long)(s.flash_write_us / 1000u),
			    (unsigned long)(s.flash_write_max_us / 1000u));
		putStr("\r\n");
		return;
	}
	putStr("error: usage: preset list | preset load <0-15> | preset save <0-15> [name]\r\n");
}

/* ---- commands added by other layers ---- */

#define EXTRA_COMMANDS 4
static struct { const char *name, *help; console_command_fn fn; } extra[EXTRA_COMMANDS];
static int extraCount;

int console_add_command(const char *name, const char *help, console_command_fn fn)
{
	if(!name || !fn || extraCount >= EXTRA_COMMANDS)
		return -1;
	extra[extraCount].name = name;
	extra[extraCount].help = help;
	extra[extraCount].fn = fn;
	extraCount++;
	return 0;
}

static void printExtraHelp(void)
{
	for(int i = 0; i < extraCount; i++)
		out("  %-24s %s\r\n", extra[i].name, extra[i].help ? extra[i].help : "");
}

static int runExtraCommand(int argc, char **argv)
{
	for(int i = 0; i < extraCount; i++)
	{
		if(strcasecmp(argv[0], extra[i].name) == 0)
		{
			extra[i].fn(argc, argv);
			return 0;
		}
	}
	return -1;
}

void console_print(const char *text)
{
	putStr(text);
}

int console_flush(uint32_t timeout_ms, uint32_t (*now_ms)(void))
{
	const uint32_t start = now_ms ? now_ms() : 0;
	while(txTail != txHead)
	{
		drainOutput();
		if(!now_ms || now_ms() - start > timeout_ms)
			break;
	}
	return txTail == txHead ? 0 : -1;
}

/* ---- bench: full-load measurement (task 9.4) ----
 * Routes drum 1 into the FX bus with the chosen effect, retriggers all seven
 * voice slots every 32 Blocks (46 ms, 32nd notes at about 160 bpm) and reports
 * the worst and mean Block render time. The changed parameters are restored
 * afterwards. Time is counted in rendered Blocks, so it works on any build. */

#define BENCH_TRIGGER_BLOCKS 32u
#define BLOCKS_PER_SECOND (44100u / LXR_BLOCK_FRAMES)

static struct {
	int active;
	uint32_t startBlocks, lastTrigger, lastReport, durationBlocks;
	uint8_t savedFxType, savedDryWet, savedOut1;
	uint8_t fxType;
	uint32_t step;
} bench;

static uint16_t paramId(const char *name)
{
	const lxr_param_info_t *p = lxr_param_find(name);
	return p ? p->id : 0xffff;
}

static void benchReport(const char *label)
{
	lxr_stats_t s;
	lxr_get_stats(&s);
	const lxr_param_info_t *fx = lxr_param_find("fx_type");
	out("bench %s fx=%s %lus: worst_block_us %lu  avg_block_us %lu  underruns %lu",
	    label, fx->enum_names[bench.fxType],
	    (unsigned long)((s.blocks - bench.startBlocks) / BLOCKS_PER_SECOND),
	    (unsigned long)s.worst_block_us, (unsigned long)s.avg_block_us, (unsigned long)s.underruns);
	if(s.temp_c_x10 != INT16_MIN)
		out("  temp %d.%d C", s.temp_c_x10 / 10, abs(s.temp_c_x10 % 10));
	putStr("\r\n");
}

static void benchStop(const char *label)
{
	benchReport(label);
	lxr_param_set(paramId("fx_type"), bench.savedFxType);
	lxr_param_set(paramId("fx_dry_wet"), bench.savedDryWet);
	lxr_param_set(paramId("audio_out1"), bench.savedOut1);
	bench.active = 0;
}

static void cmdBench(const char *fxName, const char *secondsArg)
{
	if(bench.active)
	{
		if(fxName && strcasecmp(fxName, "stop") == 0) benchStop("stopped");
		else putStr("error: bench is running, type 'bench stop'\r\n");
		return;
	}
	if(fxName && strcasecmp(fxName, "stop") == 0) { putStr("error: no bench running\r\n"); return; }

	const lxr_param_info_t *fx = lxr_param_find("fx_type");
	int fxIndex = 4; /* delay */
	if(fxName)
	{
		fxIndex = -1;
		for(unsigned i = fx->min; i <= fx->max; i++)
			if(strcasecmp(fxName, fx->enum_names[i]) == 0) fxIndex = (int)i;
		if(fxIndex < 0) { out("error: unknown fx '%s' (off drv rng cmp del)\r\n", fxName); return; }
	}
	long seconds = 10;
	if(secondsArg && (parseNumber(secondsArg, &seconds) != 0 || seconds < 1 || seconds > 3600))
	{
		putStr("error: seconds must be 1..3600\r\n");
		return;
	}

	lxr_param_get(paramId("fx_type"), &bench.savedFxType);
	lxr_param_get(paramId("fx_dry_wet"), &bench.savedDryWet);
	lxr_param_get(paramId("audio_out1"), &bench.savedOut1);
	lxr_param_set(paramId("fx_type"), (uint8_t)fxIndex);
	lxr_param_set(paramId("fx_dry_wet"), 60);
	lxr_param_set(paramId("audio_out1"), 6); /* FX bus */
	lxr_stats_reset();

	lxr_stats_t s;
	lxr_get_stats(&s);
	bench.fxType = (uint8_t)fxIndex;
	bench.startBlocks = bench.lastReport = s.blocks;
	bench.lastTrigger = s.blocks - BENCH_TRIGGER_BLOCKS;
	bench.durationBlocks = (uint32_t)seconds * BLOCKS_PER_SECOND;
	bench.step = 0;
	bench.active = 1;
	out("bench started: fx=%s for %ld s, all voices every 46 ms\r\n", fx->enum_names[fxIndex], seconds);
}

static void benchPoll(void)
{
	if(!bench.active) return;
	lxr_stats_t s;
	lxr_get_stats(&s);
	if(s.blocks - bench.lastTrigger >= BENCH_TRIGGER_BLOCKS)
	{
		static const uint8_t vel[7] = { 127, 64, 100, 30, 90, 110, 70 };
		for(int v = 0; v < LXR_NUM_VOICE_SLOTS; v++)
			lxr_trigger((lxr_voice_t)v, vel[(bench.step + (uint32_t)v) % 7]);
		bench.step++;
		bench.lastTrigger = s.blocks;
	}
	if(s.blocks - bench.lastReport >= 60u * BLOCKS_PER_SECOND)
	{
		benchReport("running");
		bench.lastReport = s.blocks;
	}
	if(s.blocks - bench.startBlocks >= bench.durationBlocks)
		benchStop("done");
}

static void execute(char *line)
{
	char *argv[4] = { 0 };
	int argc = 0;
	for(char *tok = strtok(line, " \t"); tok && argc < 4; tok = strtok(NULL, " \t"))
		argv[argc++] = tok;
	if(argc == 0) return;

	const char *cmd = argv[0];
	if(strcasecmp(cmd, "help") == 0) cmdHelp();
	else if(strcasecmp(cmd, "params") == 0) cmdParams(argv[1]);
	else if(strcasecmp(cmd, "get") == 0) cmdGet(argv[1]);
	else if(strcasecmp(cmd, "set") == 0) cmdSet(argv[1], argv[2]);
	else if(strcasecmp(cmd, "trigger") == 0) cmdTrigger(argv[1], argv[2]);
	else if(strcasecmp(cmd, "watch") == 0) cmdWatch(argv[1]);
	else if(strcasecmp(cmd, "status") == 0) cmdStatus(argv[1]);
	else if(strcasecmp(cmd, "bench") == 0) cmdBench(argv[1], argv[2]);
	else if(strcasecmp(cmd, "midi") == 0) cmdMidi(argv[1]);
	else if(strcasecmp(cmd, "preset") == 0) cmdPreset(argv[1], argv[2], argv[3]);
	else if(runExtraCommand(argc, argv) == 0) { }
	else out("error: unknown command '%s', type help\r\n", cmd);
}

/* ---- line input ---- */

static char line[CONSOLE_LINE_MAX + 1];
static int lineLen;
static int lineOverflow;

void console_set_io(const console_io_t *newIo)
{
	io = newIo;
}

void console_poll(void)
{
	if(!io || !io->read_char)
		return;

	/* bounded work per call so the main loop stays responsive */
	for(int n = 0; n < 64; n++)
	{
		const int c = io->read_char();
		if(c < 0) break;

		if(c == '\r' || c == '\n')
		{
			if(lineOverflow)
				out("error: line longer than %d characters\r\n", CONSOLE_LINE_MAX);
			else
			{
				line[lineLen] = '\0';
				execute(line);
			}
			lineLen = 0;
			lineOverflow = 0;
		}
		else if(c == '\b' || c == 0x7f)
		{
			if(lineLen > 0) lineLen--;
		}
		else if(lineLen < CONSOLE_LINE_MAX)
		{
			line[lineLen++] = (char)c;
		}
		else
		{
			lineOverflow = 1;
		}
	}
	benchPoll();
	drainOutput();
}

static void onParamChanged(uint16_t id, uint8_t value)
{
	if(!watchOn) return;
	const lxr_param_info_t *p = lxr_param_find_id(id);
	if(!p) return;
	/* queued, printed by console_poll */
	putStr("watch ");
	printValue(p, value);
	putStr("\r\n");
}

static void consoleInit(void)
{
	putStr("LXR sound module. type help\r\n");
	const int slot = lxr_preset_current();
	char n[LXR_PRESET_NAME_LEN + 1];
	if(slot >= 0 && lxr_preset_name((uint8_t)slot, n) == LXR_PRESET_OK)
		out("sound: slot %d '%s'\r\n", slot, n);
	else
		putStr("sound: factory\r\n");
}

const ui_t console_ui = { "console", consoleInit, console_poll, onParamChanged };

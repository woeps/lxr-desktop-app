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

static void cmdHelp(void)
{
	putStr("commands:\r\n"
	       "  help                     this list\r\n"
	       "  params [voice|global]    list parameters (voices: d1 d2 d3 snare cym hh)\r\n"
	       "  get <param>              show a value\r\n"
	       "  set <param> <value>      change a value (number, or name for list values)\r\n"
	       "  trigger <voice> [vel]    play a voice (d1 d2 d3 snare cym hh hho), vel 1..127\r\n"
	       "  watch on|off             print every parameter change\r\n"
	       "  status                   CPU and error counters\r\n");
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

static void cmdStatus(void)
{
	lxr_stats_t s;
	lxr_get_stats(&s);
	out("blocks %lu  worst_block_us %lu  underruns %lu  midi_errors %lu  queue_drops %lu  console_drops %lu\r\n",
	    (unsigned long)s.blocks, (unsigned long)s.worst_block_us, (unsigned long)s.underruns,
	    (unsigned long)s.midi_errors, (unsigned long)s.queue_drops, (unsigned long)txDropped);
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
	else if(strcasecmp(cmd, "status") == 0) cmdStatus();
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
}

const ui_t console_ui = { "console", consoleInit, console_poll, onParamChanged };

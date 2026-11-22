import { PARAMS, TABLE_ID } from "../generated/params";
import { clamp, factory, type Sound } from "../model/sound";
import { nameError, type LibrarySound } from "../state/library";

export const FORMAT = "lxr-sounds";
export const VERSION = 1;

/** The part of a library sound that goes into a file. */
export type FileSound = Pick<LibrarySound, "name" | "tags" | "created" | "modified" | "params">;

export interface ImportedSound {
  name: string;
  tags: string[];
  created: string;
  modified: string;
  sound: Sound;
  /** Names in the file that the page does not know (ignored). */
  unknown: string[];
  /** Known names the file lacks (taken from the factory sound). */
  missing: string[];
  /** Number of values outside their range (clamped). */
  clamped: number;
  /** Reason the name is invalid (to be fixed before import), or null. */
  nameError: string | null;
}

export interface ImportedFile {
  /** True when the file's table id differs from this page's TABLE_ID. */
  tableMismatch: boolean;
  table: string;
  sounds: ImportedSound[];
}

export type ParseResult = { ok: true; value: ImportedFile } | { ok: false; error: string };

export function exportJson(sounds: readonly FileSound[]): string {
  const out = sounds.map((s) => ({
    name: s.name, tags: s.tags, created: s.created, modified: s.modified, params: s.params,
  }));
  return JSON.stringify({ format: FORMAT, version: VERSION, table: TABLE_ID, sounds: out }, null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);

/** Only .json is accepted. Returns the refusal message or null. */
export function checkJsonName(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  const ext = dot < 0 ? "" : filename.slice(dot).toLowerCase();
  return ext === ".json" ? null : `${filename}: only .json sound files can be opened here`;
}

/** Parse and validate by hand; nothing is evaluated and only names found in PARAMS are read. */
export function importJson(text: string, now = new Date().toISOString()): ParseResult {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, error: "This is not a JSON file." };
  }
  if (!isObj(doc) || doc.format !== FORMAT) return { ok: false, error: "This is not an LXR sound file." };
  if (doc.version !== VERSION) return { ok: false, error: `Unsupported file version ${String(doc.version)}.` };
  if (!Array.isArray(doc.sounds)) return { ok: false, error: "The file has no list of sounds." };

  const known = new Set(PARAMS.map((p) => p.name));
  const sounds: ImportedSound[] = [];
  for (const raw of doc.sounds) {
    if (!isObj(raw) || !isObj(raw.params)) return { ok: false, error: "A sound in the file is malformed." };
    const name = str(raw.name, "");
    const sound = factory(name);
    const params = raw.params;
    const missing: string[] = [];
    let clamped = 0;
    for (const p of PARAMS) {
      const v = Object.hasOwn(params, p.name) ? params[p.name] : undefined;
      if (typeof v !== "number" || !Number.isFinite(v)) { missing.push(p.name); continue; }
      const c = clamp(p.id, v);
      if (c !== v) clamped++;
      sound.values[p.id] = c;
    }
    const unknown = Object.keys(params).filter((k) => !known.has(k));
    const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [];
    sounds.push({
      name, tags, created: str(raw.created, now), modified: str(raw.modified, now),
      sound, unknown, missing, clamped, nameError: nameError(name),
    });
  }
  const table = str(doc.table, "");
  return { ok: true, value: { tableMismatch: table !== TABLE_ID, table, sounds } };
}

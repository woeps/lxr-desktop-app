import { PARAMS } from "../generated/params";
import { VALUES_LENGTH } from "../model/params";
import { clamp, factory, type Sound } from "../model/sound";

/** Same layout as host/scripts/import_kit.py: 8-byte name, then parameter `id` at byte 8 + id. */
export const NAME_LEN = 8;
export const SND_LENGTH = NAME_LEN + VALUES_LENGTH;

export interface SndImport {
  sound: Sound;
  /** Parameter bytes the file was too short for (set to 0: older firmware). */
  padded: number;
  /** Bytes after the last parameter (ignored). */
  extra: number;
  /** Number of values outside their range (clamped). */
  clamped: number;
}
export type SndResult = { ok: true; value: SndImport } | { ok: false; error: string };

/** Only .SND is accepted; the message matches import_kit.py. Returns the refusal or null. */
export function checkSndName(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  const ext = dot < 0 ? "" : filename.slice(dot).toUpperCase();
  if (ext && ext !== ".SND") {
    return `${filename}: only kit files (.SND) can be imported; '${ext}' files hold sequencer data`;
  }
  return null;
}

export function importSnd(filename: string, data: Uint8Array): SndResult {
  const bad = checkSndName(filename);
  if (bad) return { ok: false, error: bad };
  if (data.length < NAME_LEN) {
    return { ok: false, error: `${filename}: too short for a kit file (${data.length} bytes)` };
  }
  let end = data.subarray(0, NAME_LEN).indexOf(0);
  if (end < 0) end = NAME_LEN;
  let name = "";
  for (let i = 0; i < end; i++) name += String.fromCharCode(data[i]! & 0x7f);
  const sound = factory(name.trimEnd());
  let clamped = 0;
  for (const p of PARAMS) {
    const i = NAME_LEN + p.id;
    const raw = i < data.length ? data[i]! : 0;
    const c = clamp(p.id, raw);
    if (i < data.length && c !== raw) clamped++;
    sound.values[p.id] = c;
  }
  return {
    ok: true,
    value: {
      sound,
      padded: Math.max(0, SND_LENGTH - data.length),
      extra: Math.max(0, data.length - SND_LENGTH),
      clamped,
    },
  };
}

/** Name padded with NUL to 8 bytes, then all 247 value bytes (ids outside PARAMS are 0). */
export function exportSnd(sound: Sound): Uint8Array {
  const out = new Uint8Array(SND_LENGTH);
  for (let i = 0; i < Math.min(NAME_LEN, sound.name.length); i++) out[i] = sound.name.charCodeAt(i) & 0x7f;
  for (const p of PARAMS) out[NAME_LEN + p.id] = sound.values[p.id]!;
  return out;
}

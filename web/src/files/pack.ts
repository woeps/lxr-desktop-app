import type { Sound } from "../model/sound";
import { importSnd, sndNotes } from "./snd";

export interface PackFile {
  path: string;
  size: number;
  read(): Promise<ArrayBuffer>;
}

export interface Preset {
  /** Path, unique within a pack. */
  key: string;
  /** File name shown in the list. */
  file: string;
  /** Name stored in the file, editable before it is added to the library. */
  name: string;
  sound: Sound;
  notes: string[];
}
export interface Unreadable {
  file: string;
  reason: string;
}
export interface Pack {
  presets: Preset[];
  unreadable: Unreadable[];
  ignored: number;
}

/** Bigger files are not read. */
export const MAX_PRESET_FILE = 65536;

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function scanPack(files: PackFile[]): Promise<Pack> {
  const presets: Preset[] = [];
  const unreadable: Unreadable[] = [];
  let ignored = 0;
  for (const f of files) {
    const file = f.path.slice(f.path.lastIndexOf("/") + 1);
    const dot = file.lastIndexOf(".");
    if (dot < 0 || file.slice(dot + 1).toUpperCase() !== "SND") {
      ignored++;
      continue;
    }
    if (f.size > MAX_PRESET_FILE) {
      unreadable.push({ file, reason: `larger than ${MAX_PRESET_FILE / 1024} KiB, not read` });
      continue;
    }
    let data: ArrayBuffer;
    try {
      data = await f.read();
    } catch {
      unreadable.push({ file, reason: "could not be read" });
      continue;
    }
    const r = importSnd(file, new Uint8Array(data));
    if (!r.ok) {
      unreadable.push({ file, reason: r.error });
      continue;
    }
    presets.push({ key: f.path, file, name: r.value.sound.name, sound: r.value.sound, notes: sndNotes(r.value) });
  }
  presets.sort((a, b) => byCodeUnit(a.file, b.file) || byCodeUnit(a.key, b.key));
  return { presets, unreadable, ignored };
}

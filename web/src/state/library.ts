import { createStore, flush } from "solid-js";
import { PARAMS } from "../generated/params";
import { clamp, factory, type Sound } from "../model/sound";

export const LIBRARY_KEY = "lxr.library.v1";
export const NAME_MAX = 8;

/** A stored sound; values are by parameter name so a table change does not shift them (design 4.7). */
export interface LibrarySound {
  id: string;
  name: string;
  tags: string[];
  /** ISO 8601 */
  created: string;
  modified: string;
  params: Record<string, number>;
}

export type LibraryResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

export const QUOTA_MESSAGE =
  "Browser storage is full, so nothing was saved. Export the library or delete sounds to make room.";

/** The one name rule (R6.2), shared with import: 1 to 8 characters, each 32..126. Returns the reason or null. */
export function nameError(name: string): string | null {
  if (name.length === 0) return "A name needs at least 1 character.";
  if (name.length > NAME_MAX) return `A name can have at most ${NAME_MAX} characters.`;
  for (const ch of name) {
    const c = ch.codePointAt(0)!;
    if (c < 32 || c > 126) return "A name can only use printable ASCII characters (space to ~).";
  }
  return null;
}

export const nameKey = (n: string) => n.trim().toLowerCase();
export const cleanName = (raw: string) => raw.trim();

/** A numbered variant of `name` whose key is not in `taken`: trailing digits removed, then 2, 3, ... appended within NAME_MAX. */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  const stem = name.replace(/\d+$/, "") || "s";
  for (let k = 2; ; k++) {
    const cand = stem.slice(0, NAME_MAX - String(k).length) + k;
    if (!taken.has(nameKey(cand))) return cand;
  }
}

const existsError = (name: string) => `A sound named '${name}' already exists.`;

export function toParams(sound: Sound): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of PARAMS) out[p.name] = sound.values[p.id]!;
  return out;
}

export function toSound(s: LibrarySound): Sound {
  const sound = factory(s.name);
  for (const p of PARAMS) {
    const v = s.params[p.name];
    if (typeof v === "number" && Number.isFinite(v)) sound.values[p.id] = clamp(p.id, v);
  }
  return sound;
}

export type SortKey = "name" | "created" | "modified";
export interface ListOptions {
  /** name: A to Z; created and modified: newest first. Default name. */
  sort?: SortKey;
  /** Case-insensitive text found in the name or in any tag. */
  filter?: string;
}

export interface LibraryDeps {
  now?: () => Date;
  uuid?: () => string;
  /** Where storage.persist() is looked up; default the global navigator. */
  nav?: { storage?: { persist?: () => Promise<boolean> } };
}

const str = (v: unknown): v is string => typeof v === "string";

/** Keep valid entries; anything unreadable gives an empty or shorter library. */
function parse(raw: string | null): { sounds: LibrarySound[]; renamed: number } {
  const none = { sounds: [], renamed: 0 };
  if (raw === null) return none;
  let p: unknown;
  try { p = JSON.parse(raw); } catch { return none; }
  const list = (p as { version?: unknown; sounds?: unknown } | null)?.sounds;
  if ((p as { version?: unknown } | null)?.version !== 1 || !Array.isArray(list)) return none;
  const seen = new Set<string>();
  const out: LibrarySound[] = [];
  for (const e of list as Record<string, unknown>[]) {
    if (!e || typeof e !== "object" || !str(e.id) || seen.has(e.id) || !str(e.name) || nameError(e.name)) continue;
    if (!str(e.created) || !str(e.modified)) continue;
    const params: Record<string, number> = {};
    if (e.params && typeof e.params === "object") {
      for (const [k, v] of Object.entries(e.params)) if (typeof v === "number") params[k] = v;
    }
    const tags = Array.isArray(e.tags) ? e.tags.filter((t): t is string => str(t) && t.trim() !== "") : [];
    seen.add(e.id);
    out.push({ id: e.id, name: e.name, tags, created: e.created, modified: e.modified, params });
  }
  // R3.3: the first by `created` keeps its name, later ones get a free numbered name.
  const taken = new Set<string>();
  let renamed = 0;
  for (const e of [...out].sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0))) {
    if (taken.has(nameKey(e.name))) { e.name = freeName(e.name, taken); renamed++; }
    taken.add(nameKey(e.name));
  }
  return { sounds: out, renamed };
}

export interface Library {
  /** Reactive, in insertion order. Use list() for sorted or filtered views. */
  readonly sounds: readonly LibrarySound[];
  get(id: string): LibrarySound | undefined;
  list(opts?: ListOptions): LibrarySound[];
  /** Entry with this name, compared case-insensitively. */
  findByName(name: string): LibrarySound | undefined;
  /** Sounds renamed on load to make names unique (R3.3). */
  readonly renamedOnLoad: number;
  /** Store a sound under a new id. Fails when the name exists. */
  add(name: string, sound: Sound, tags?: string[]): LibraryResult<LibrarySound>;
  /** Replace the values of an existing entry. */
  update(id: string, sound: Sound): LibraryResult;
  /** Set values and name of an existing entry in one write. */
  replace(id: string, name: string, sound: Sound): LibraryResult;
  rename(id: string, name: string): LibraryResult;
  remove(id: string): LibraryResult;
  addTag(id: string, tag: string): LibraryResult;
  removeTag(id: string, tag: string): LibraryResult;
  /** Ask the browser once for persistent storage. Resolves null when unsupported or it throws. */
  requestPersistence(): Promise<boolean | null>;
}

/**
 * The library in `lxr.library.v1`. Every change is written to storage first; when the write
 * fails (quota) the in-memory library stays as it was and the result carries QUOTA_MESSAGE.
 */
export function createLibrary(storage: Storage, deps: LibraryDeps = {}): Library {
  const now = deps.now ?? (() => new Date());
  const uuid = deps.uuid ?? (() => crypto.randomUUID());
  const loaded = parse(storage.getItem(LIBRARY_KEY));
  const [state, setState] = createStore<{ sounds: LibrarySound[] }>({ sounds: loaded.sounds });
  if (loaded.renamed > 0) {
    // A failed write (quota) keeps the in-memory fix and leaves the stored list as is.
    try { storage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, sounds: loaded.sounds })); } catch { /* keep */ }
  }
  let persistAsked: Promise<boolean | null> | null = null;

  const find = (id: string) => state.sounds.find((s) => s.id === id);
  const snap = (s: LibrarySound): LibrarySound => ({ ...s, tags: [...s.tags], params: { ...s.params } });
  const byName = (name: string, except?: string) =>
    state.sounds.find((s) => s.id !== except && nameKey(s.name) === nameKey(name));
  const missing = { ok: false, error: "That sound is not in the library." } as const;

  function commit(next: LibrarySound[]): LibraryResult {
    try {
      storage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, sounds: next }));
    } catch {
      return { ok: false, error: QUOTA_MESSAGE };
    }
    setState((s) => { s.sounds = next; });
    flush();
    return { ok: true, value: undefined };
  }

  /** Apply `edit` to a copy of one entry and commit. */
  function edit(id: string, fn: (s: LibrarySound) => string | null): LibraryResult {
    const cur = find(id);
    if (!cur) return missing;
    const copy = snap(cur);
    const err = fn(copy);
    if (err) return { ok: false, error: err };
    copy.modified = now().toISOString();
    return commit(state.sounds.map((s) => (s.id === id ? copy : snap(s))));
  }

  function insert(entry: LibrarySound): LibraryResult<LibrarySound> {
    const r = commit([...state.sounds.map(snap), entry]);
    return r.ok ? { ok: true, value: entry } : r;
  }

  return {
    get sounds() { return state.sounds; },
    get: (id) => find(id),
    findByName: (name) => byName(name),
    renamedOnLoad: loaded.renamed,
    list({ sort = "name", filter = "" } = {}) {
      const q = filter.trim().toLowerCase();
      const out = state.sounds.filter((s) =>
        q === "" || s.name.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q)));
      const by: Record<SortKey, (a: LibrarySound, b: LibrarySound) => number> = {
        name: (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
        created: (a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0),
        modified: (a, b) => (a.modified < b.modified ? 1 : a.modified > b.modified ? -1 : 0),
      };
      return out.sort(by[sort]);
    },
    add(raw, sound, tags = []) {
      const name = cleanName(raw);
      const e = nameError(name);
      if (e) return { ok: false, error: e };
      if (byName(name)) return { ok: false, error: existsError(name) };
      const t = now().toISOString();
      const clean = [...new Set(tags.map((x) => x.trim()).filter((x) => x !== ""))];
      return insert({ id: uuid(), name, tags: clean, created: t, modified: t, params: toParams(sound) });
    },
    update: (id, sound) => edit(id, (s) => { s.params = toParams(sound); return null; }),
    replace: (id, raw, sound) => edit(id, (s) => {
      const name = cleanName(raw);
      const e = nameError(name) ?? (byName(name, id) ? existsError(name) : null);
      if (!e) { s.name = name; s.params = toParams(sound); }
      return e;
    }),
    rename: (id, raw) => edit(id, (s) => {
      const name = cleanName(raw);
      const e = nameError(name) ?? (byName(name, id) ? existsError(name) : null);
      if (!e) s.name = name;
      return e;
    }),
    remove(id) {
      if (!find(id)) return missing;
      return commit(state.sounds.filter((s) => s.id !== id).map(snap));
    },
    addTag: (id, tag) => edit(id, (s) => {
      const t = tag.trim();
      if (t === "") return "A tag cannot be empty.";
      if (!s.tags.includes(t)) s.tags.push(t);
      return null;
    }),
    removeTag: (id, tag) => edit(id, (s) => { s.tags = s.tags.filter((t) => t !== tag); return null; }),
    requestPersistence() {
      persistAsked ??= (async () => {
        const nav = deps.nav ?? (typeof navigator === "undefined" ? undefined : navigator);
        const persist = nav?.storage?.persist;
        if (typeof persist !== "function") return null;
        try { return await persist.call(nav!.storage); } catch { return null; }
      })();
      return persistAsked;
    },
  };
}

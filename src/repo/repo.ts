import { richToMarkdown } from "../rich";
import { ConflictError, DEFAULT_PREFS, NotFoundError, ValidationError } from "../domain";
import type { Draft, Note, NoteInput, Prefs, View } from "../domain";

/** Storage seam. Browser preview uses localStorage; the Windows app swaps in the Tauri/SQLite bridge. */
/** Trim, collapse slashes and spaces, cap depth at 3 and length at 40 per level. */
export const cleanFolder = (f?: string) => (f ?? "").split("/").map(x => x.trim().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean).slice(0, 3).join("/");
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export interface NoteRepo {
  list(opts: { view: View; query: string; folder?: string }): Promise<Note[]>;
  get(id: string): Promise<Note>;
  create(input: NoteInput): Promise<Note>;
  update(id: string, expectedRevision: number, patch: NoteInput): Promise<Note>;
  setPinned(id: string, pinned: boolean): Promise<Note>;
  trash(id: string): Promise<Note>;
  restore(id: string): Promise<Note>;
  deleteForever(id: string): Promise<void>;
  listDrafts(): Promise<Draft[]>;
  /** Keeps (or updates) an unfinished capture. Returns its id. Empty text removes it. */
  saveDraft(text: string, id?: string): Promise<string>;
  deleteDraft(id: string): Promise<void>;
  getPrefs(): Promise<Prefs>;
  setPrefs(p: Prefs): Promise<Prefs>;
  exportJson(): Promise<string>;
  exportMarkdown(id: string): Promise<{ filename: string; text: string }>;
  runDailyBackup(): Promise<boolean>;
  listBackups(): Promise<{ day: string; count: number }[]>;
  restoreBackup(day: string): Promise<void>;
  /** Sync support. Raw access that keeps ids, timestamps and revisions as they are. */
  syncState(): Promise<{ notes: Note[]; tombstones: string[]; prefs: Prefs }>;
  /** Folds cloud notes in. The newer edit wins; a note deleted here stays deleted. Returns what changed. */
  syncMerge(remote: Note[], opts?: { prefs?: Partial<Prefs> }): Promise<{ added: number; updated: number }>;
  syncClearTombstones(ids: string[]): Promise<void>;
  /** Snapshot under a name (for example "before-sync") so a first sync can always be undone. */
  backupNow(label: string): Promise<void>;
  /** Used on sign-out after a final sync: keeps a backup, then empties this PC so the next account starts clean. */
  wipeNotes(): Promise<void>;
}

type Store = { v: 1; tombstones?: string[]; notes: Note[]; draft?: { text: string; updatedAt: number } | null; drafts?: Draft[]; prefs: Prefs };
const KEY = "pip.store.v1";
const BACKUP_KEY = "pip.backups.v1";
const KEEP = 7;

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}${Date.now()}`);
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function deriveTitle(title: string, body: string) {
  if (title.trim()) return title.trim();
  const first = body.split("\n").find(l => l.trim());
  return first ? first.trim().slice(0, 80) : "Untitled";
}

function validBackup(s: unknown): s is Store {
  const x = s as Store;
  return !!x && x.v === 1 && Array.isArray(x.notes) && x.notes.every(n => typeof n.id === "string" && typeof n.revision === "number" && Array.isArray(n.checklist)) && !!x.prefs;
}

export function createRepo(kv: KV, now: () => number = Date.now): NoteRepo {
  const load = (): Store => {
    const raw = kv.getItem(KEY);
    if (!raw) return { v: 1, notes: [], drafts: [], prefs: { ...DEFAULT_PREFS } };
    const s = JSON.parse(raw) as Store;
    if (!validBackup(s)) throw new Error("Stored notes could not be read. Nothing was changed.");
    // Older stores kept one draft. Fold it into the list.
    const drafts = s.drafts ?? (s.draft ? [{ id: uid(), ...s.draft }] : []);
    return { ...s, drafts, draft: null, prefs: { ...DEFAULT_PREFS, ...s.prefs } };
  };
  const save = (s: Store) => {
    const text = JSON.stringify(s);
    kv.setItem(KEY, text);
    if (kv.getItem(KEY) !== text) throw new Error("Couldn't write to storage.");
  };
  const find = (s: Store, id: string) => { const n = s.notes.find(n => n.id === id); if (!n) throw new NotFoundError(); return n; };
  const mutate = (id: string, fn: (n: Note, s: Store) => void) => {
    const s = load(); const n = find(s, id); fn(n, s); n.updatedAt = now(); n.revision += 1; save(s); return { ...n };
  };
  const matches = (n: Note, q: string) => {
    if (!q.trim()) return true;
    const hay = `${n.title}\n${n.body}\n${n.checklist.map(c => c.text).join("\n")}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t));
  };
  const readBackups = (): Record<string, Store> => JSON.parse(kv.getItem(BACKUP_KEY) ?? "{}");

  return {
    async list({ view, query, folder }) {
      const s = load(); const today = dayKey(now());
      return s.notes
        .filter(n => view === "trash" ? n.deletedAt !== null : n.deletedAt === null)
        .filter(n => view === "pinned" ? n.pinned : view === "today" ? dayKey(n.createdAt) === today || dayKey(n.updatedAt) === today : true)
        .filter(n => !folder || n.folder === folder || !!n.folder?.startsWith(folder + "/"))
        .filter(n => matches(n, query))
        .sort((a, b) => Number(b.pinned && view === "all") - Number(a.pinned && view === "all") || b.updatedAt - a.updatedAt)
        .map(n => ({ ...n }));
    },
    async get(id) { return { ...find(load(), id) }; },
    async create(input) {
      const body = input.body ?? ""; const checklist = input.checklist ?? [];
      if (!body.trim() && !checklist.length && !(input.title ?? "").trim()) throw new ValidationError("Write something first.");
      const s = load(); const t = now();
      const n: Note = { id: uid(), title: deriveTitle(input.title ?? "", body), body, ...(input.rich ? { rich: input.rich } : {}), checklist, createdAt: t, updatedAt: t, pinned: !!input.pinned, ...(cleanFolder(input.folder) ? { folder: cleanFolder(input.folder) } : {}), deletedAt: null, revision: 1 };
      s.notes.push(n); save(s); return { ...n };
    },
    async update(id, expected, patch) {
      const s = load(); const n = find(s, id);
      if (n.deletedAt !== null) throw new ValidationError("Restore this note before editing it.");
      if (n.revision !== expected) throw new ConflictError({ ...n });
      return mutate(id, m => {
        if (patch.body !== undefined) m.body = patch.body;
        if (patch.rich !== undefined) m.rich = patch.rich || undefined;
        if (patch.checklist !== undefined) m.checklist = patch.checklist;
        if (patch.pinned !== undefined) m.pinned = patch.pinned;
        if (patch.folder !== undefined) { const f = cleanFolder(patch.folder); if (f) m.folder = f; else delete m.folder; }
        if (patch.title !== undefined) m.title = patch.title.trim() ? patch.title.trim() : deriveTitle("", m.body);
      });
    },
    async setPinned(id, pinned) { return mutate(id, n => { n.pinned = pinned; }); },
    async trash(id) { return mutate(id, n => { n.deletedAt = now(); }); },
    async restore(id) { return mutate(id, n => { n.deletedAt = null; }); },
    async deleteForever(id) {
      const s = load(); const n = find(s, id);
      if (n.deletedAt === null) throw new ValidationError("Move the note to Trash first.");
      s.notes = s.notes.filter(x => x.id !== id); s.tombstones = [...new Set([...(s.tombstones ?? []), id])]; save(s);
    },
    async listDrafts() { return [...(load().drafts ?? [])].sort((a, b) => b.updatedAt - a.updatedAt); },
    async saveDraft(text, id) {
      const s = load(); const list = (s.drafts ?? []).filter(d => d.id !== id);
      const nid = id ?? uid();
      s.drafts = text.trim() ? [...list, { id: nid, text, updatedAt: now() }] : list; save(s); return nid;
    },
    async deleteDraft(id) { const s = load(); s.drafts = (s.drafts ?? []).filter(d => d.id !== id); save(s); },
    async getPrefs() { return load().prefs; },
    async setPrefs(p) { const s = load(); s.prefs = p; save(s); return p; },
    async exportJson() {
      const s = load();
      return JSON.stringify({ format: "pip-notes", version: 1, exportedAt: new Date(now()).toISOString(), notes: s.notes.filter(n => n.deletedAt === null) }, null, 2);
    },
    async exportMarkdown(id) {
      const n = find(load(), id);
      const list = n.checklist.map(c => `- [${c.done ? "x" : " "}] ${c.text}`).join("\n");
      const body = n.rich ? richToMarkdown(n.rich) : n.body;
      const text = `# ${n.title}\n\n${body}${body && list ? "\n\n" : ""}${list}\n`;
      return { filename: `${n.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60) || "note"}.md`, text };
    },
    async runDailyBackup() {
      const day = dayKey(now()); const b = readBackups();
      if (b[day]) return false;
      b[day] = load();
      Object.keys(b).sort().slice(0, Math.max(0, Object.keys(b).length - KEEP)).forEach(k => delete b[k]);
      kv.setItem(BACKUP_KEY, JSON.stringify(b)); return true;
    },
    async listBackups() {
      const b = readBackups();
      return Object.keys(b).sort().reverse().map(day => ({ day, count: b[day].notes.length }));
    },
    async syncState() { const s = load(); return { notes: s.notes.map(n => ({ ...n })), tombstones: [...(s.tombstones ?? [])], prefs: s.prefs }; },
    async syncMerge(remote, opts) {
      const s = load(); let added = 0, updated = 0; const dead = new Set(s.tombstones ?? []);
      for (const r of remote) {
        if (dead.has(r.id)) continue;
        const i = s.notes.findIndex(n => n.id === r.id);
        if (i < 0) { s.notes.push({ ...r }); added++; }
        else if (r.updatedAt > s.notes[i].updatedAt) { s.notes[i] = { ...r }; updated++; }
      }
      if (opts?.prefs) s.prefs = { ...s.prefs, ...opts.prefs };
      if (added || updated || opts?.prefs) save(s);
      return { added, updated };
    },
    async syncClearTombstones(ids) { const s = load(); s.tombstones = (s.tombstones ?? []).filter(x => !ids.includes(x)); save(s); },
    async backupNow(label) {
      const b = readBackups(); b[`${dayKey(now())}-${label}`] = load(); kv.setItem(BACKUP_KEY, JSON.stringify(b));
    },
    async wipeNotes() {
      const b = readBackups(); b[`${dayKey(now())}-before-signout`] = load(); kv.setItem(BACKUP_KEY, JSON.stringify(b));
      const s = load(); s.notes = []; s.tombstones = []; s.drafts = []; save(s);
    },
    async restoreBackup(day) {
      const b = readBackups(); const snap = b[day];
      if (!validBackup(snap)) throw new ValidationError("That backup is damaged. Your current notes were not touched.");
      const current = load(); b[`${dayKey(now())}-before-restore`] = current; kv.setItem(BACKUP_KEY, JSON.stringify(b));
      save(snap);
    },
  };
}

export const memoryKV = (): KV => { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }; };

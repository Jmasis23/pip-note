import { repo } from "../useNotes";
import type { Note, Prefs } from "../domain";
import { freshSession } from "./auth";
import { SUPABASE_ANON, SUPABASE_URL } from "./config";

type Row = { id: string; title: string; body: string; rich: string | null; checklist: Note["checklist"]; pinned: boolean; folder: string | null; created_at: string; updated_at: string; deleted_at: string | null; revision: number };
const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string) => Date.parse(s);
export const toRow = (n: Note): Row => ({ id: n.id, title: n.title, body: n.body, rich: n.rich ?? null, checklist: n.checklist, pinned: n.pinned, folder: n.folder ?? null, created_at: iso(n.createdAt), updated_at: iso(n.updatedAt), deleted_at: n.deletedAt === null ? null : iso(n.deletedAt), revision: n.revision });
export const fromRow = (r: Row): Note => ({ id: r.id, title: r.title, body: r.body, ...(r.rich ? { rich: r.rich } : {}), checklist: r.checklist ?? [], pinned: r.pinned, ...(r.folder ? { folder: r.folder } : {}), createdAt: ms(r.created_at), updatedAt: ms(r.updated_at), deletedAt: r.deleted_at ? ms(r.deleted_at) : null, revision: r.revision });
/** Settings that follow you between PCs. Shortcut, shake and launch-at-login stay per device. */
const SHARED: (keyof Prefs)[] = ["theme", "reducedMotion", "cardSize", "textSize", "accent", "tint", "extraFolders"];

export type SyncStatus = { state: "off" | "idle" | "syncing" | "error" | "offline"; at: number; message: string; last?: { pulled: number; pushed: number; firstTime: boolean } };
let status: SyncStatus = { state: "off", at: 0, message: "" };
const subs = new Set<(s: SyncStatus) => void>();
const set = (s: Partial<SyncStatus>) => { status = { ...status, ...s }; subs.forEach(f => f(status)); };
export const syncStatus = () => status;
export const onSyncStatus = (f: (s: SyncStatus) => void) => { subs.add(f); return () => { subs.delete(f); }; };

async function api(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers as object) } });
  if (!r.ok) throw new Error(`Sync failed (${r.status}).`);
  return r;
}

let running: Promise<void> | null = null;
/** One round: pull what's new in the cloud, merge, push what changed here. Safe to call often; overlapping calls share one run. */
export function syncNow(opts: { first?: boolean } = {}): Promise<void> {
  if (running) return running;
  running = (async () => {
    const s = await freshSession(); if (!s) { set({ state: "off" }); return; }
    set({ state: "syncing", message: "" });
    try {
      const cursorKey = `pip.sync.cursor.${s.user.id}`; const first = localStorage.getItem(cursorKey) === null;
      if (first) await repo.backupNow("before-sync");
      const since = Number(localStorage.getItem(cursorKey) ?? 0);
      const rows: Row[] = await (await api(s.access_token, `notes?select=*&updated_at=gt.${encodeURIComponent(iso(since))}&order=updated_at.asc&limit=1000`)).json();
      const prefRows: { prefs: Partial<Prefs> }[] = await (await api(s.access_token, "user_prefs?select=prefs&limit=1")).json();
      const shared = prefRows[0]?.prefs ? Object.fromEntries(SHARED.filter(k => k in prefRows[0].prefs).map(k => [k, prefRows[0].prefs[k]])) as Partial<Prefs> : undefined;
      const merged = await repo.syncMerge(rows.map(fromRow), first && shared && Object.keys(shared).length ? { prefs: shared } : undefined);
      const local = await repo.syncState();
      const remoteSeen = new Map(rows.map(r => [r.id, ms(r.updated_at)]));
      const lastPush = Number(localStorage.getItem(`pip.sync.push.${s.user.id}`) ?? 0);
      const out = local.notes.filter(n => n.updatedAt > lastPush || first).filter(n => (remoteSeen.get(n.id) ?? -1) < n.updatedAt);
      for (let i = 0; i < out.length; i += 200) {
        await api(s.access_token, "notes?on_conflict=id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(out.slice(i, i + 200).map(toRow)) });
      }
      if (local.tombstones.length) {
        await api(s.access_token, `notes?id=in.(${local.tombstones.join(",")})`, { method: "DELETE", headers: { prefer: "return=minimal" } });
        await repo.syncClearTombstones(local.tombstones);
      }
      const prefsOut = Object.fromEntries(SHARED.map(k => [k, local.prefs[k]]));
      await api(s.access_token, "user_prefs?on_conflict=user_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: s.user.id, prefs: prefsOut, updated_at: iso(Date.now()) }) });
      const newest = Math.max(since, ...rows.map(r => ms(r.updated_at)));
      localStorage.setItem(cursorKey, String(newest || 1));
      localStorage.setItem(`pip.sync.push.${s.user.id}`, String(Date.now()));
      set({ state: "idle", at: Date.now(), message: "", last: { pulled: merged.added + merged.updated, pushed: out.length, firstTime: first } });
      if (merged.added || merged.updated) window.dispatchEvent(new StorageEvent("storage", { key: "pip.store.v1" }));
    } catch (e) {
      const offline = e instanceof TypeError;
      set({ state: offline ? "offline" : "error", message: offline ? "Offline. Pip will catch up when you're back." : (e as Error).message });
    }
  })().finally(() => { running = null; });
  return running;
}

/** Keeps the cloud copy fresh: a sync on start, after edits settle, when the window regains focus, and every few minutes. */
export function startSync(): () => void {
  void syncNow();
  let t: ReturnType<typeof setTimeout> | undefined;
  const soon = () => { clearTimeout(t); t = setTimeout(() => void syncNow(), 4000); };
  const on = () => { if (status.state !== "syncing") soon(); };
  const focus = () => void syncNow();
  window.addEventListener("pip:changed", on); window.addEventListener("storage", on); window.addEventListener("focus", focus);
  const iv = setInterval(() => void syncNow(), 5 * 60_000);
  return () => { window.removeEventListener("pip:changed", on); window.removeEventListener("storage", on); window.removeEventListener("focus", focus); clearInterval(iv); clearTimeout(t); };
}

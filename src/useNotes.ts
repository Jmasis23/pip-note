import { useCallback, useEffect, useRef, useState } from "react";
import { createRepo } from "./repo/repo";
import type { NoteRepo } from "./repo/repo";
import { DEFAULT_PREFS } from "./domain";
import type { Note, Prefs, View } from "./domain";

import { kv } from "./native";
export const repo: NoteRepo = createRepo(kv);

export function useNotes() {
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [counts, setCounts] = useState<Record<View, number>>({ all: 0, today: 0, pinned: 0, trash: 0 });
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    const [list, a, t, p, tr, pr] = await Promise.all([
      repo.list({ view, query, folder }), repo.list({ view: "all", query: "" }), repo.list({ view: "today", query: "" }),
      repo.list({ view: "pinned", query: "" }), repo.list({ view: "trash", query: "" }), repo.getPrefs(),
    ]);
    if (my !== seq.current) return;
    setNotes(list); setFolders([...new Set([...a.map(n => n.folder).filter((f): f is string => !!f), ...(pr.extraFolders ?? [])])].sort()); setCounts({ all: a.length, today: t.length, pinned: p.length, trash: tr.length }); setPrefsState(pr);
  }, [view, query, folder]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void repo.runDailyBackup(); }, []);
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key?.startsWith("pip.")) void refresh(); };
    window.addEventListener("storage", on); return () => window.removeEventListener("storage", on);
  }, [refresh]);

  const setPrefs = async (p: Prefs) => { setPrefsState(await repo.setPrefs(p)); };
  return { folder, setFolder, folders, view, setView, query, setQuery, notes, counts, prefs, setPrefs, refresh };
}

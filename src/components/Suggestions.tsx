import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Note } from "../domain";
import { repo } from "../useNotes";
import { kv } from "../native";
import { aiAvailable, aiComplete, aiStatus } from "../ai/client";
import { localSuggestions, parseSuggestions, suggestMessages, when, type NoteDigest, type Suggestion } from "../ai/plan";
import { addReminder } from "../ai/reminders";
import "./ai.css";

const ON = "pip.sugg.on", CACHE = "pip.sugg.cache", NO = "pip.sugg.no", GAP = 20 * 60_000;
export const suggestionsOn = () => kv.getItem(ON) !== "0";
export const setSuggestionsOn = (v: boolean) => kv.setItem(ON, v ? "1" : "0");
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(kv.getItem(k) ?? "") as T; } catch { return d; } };

export function digest(notes: Note[], now: number): NoteDigest[] {
  return notes.filter(n => n.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 25).map(n => ({ id: n.id, title: n.title, folder: n.folder ?? undefined, body: n.body, open: n.checklist.filter(c => !c.done && c.text.trim()).map(c => c.text), ageDays: Math.floor((now - n.updatedAt) / 864e5) }));
}

export function Suggestions({ notes, folders, now }: { notes: Note[]; folders: string[]; now: number }) {
  const dig = useMemo(() => digest(notes, now), [notes, now]);
  const sig = useMemo(() => dig.map(d => d.id + d.title.length + d.body.length + d.open.length + (d.folder ?? "")).join("|"), [dig]);
  const [ai, setAi] = useState<Suggestion[]>(() => read<{ items: Suggestion[] }>(CACHE, { items: [] }).items);
  const [no, setNo] = useState<string[]>(() => read<string[]>(NO, []));
  const [, bump] = useState(0);
  useEffect(() => {
    if (!aiAvailable() || !suggestionsOn() || !dig.length) return;
    const c = read<{ sig: string; at: number; items: Suggestion[] } | null>(CACHE, null);
    if (c && (c.sig === sig || Date.now() - c.at < GAP)) return;
    let live = true;
    const t = window.setTimeout(async () => {
      try {
        if (!(await aiStatus()).primary) return;
        const out = await aiComplete(suggestMessages(dig, Date.now(), folders), 2500);
        const items = parseSuggestions(out, Date.now(), new Set(dig.map(d => d.id)));
        kv.setItem(CACHE, JSON.stringify({ sig, at: Date.now(), items }));
        if (live) setAi(items);
      } catch { /* quiet: suggestions are optional */ }
    }, 2500);
    return () => { live = false; window.clearTimeout(t); };
  }, [sig]);
  void bump;
  const shown = [...localSuggestions(dig, now), ...(suggestionsOn() ? ai : [])].filter((s, i, a) => !no.includes(s.id) && a.findIndex(x => x.id === s.id) === i).slice(0, 3);
  const drop = (id: string) => { const n = [...no, id].slice(-200); setNo(n); kv.setItem(NO, JSON.stringify(n)); };
  const accept = async (s: Suggestion) => {
    try {
      if (s.action.type === "reminder") addReminder({ text: s.action.text, at: s.action.at, noteId: s.action.noteId });
      else if (s.action.type === "folder") { const n = await repo.get(s.action.noteId); await repo.update(n.id, n.revision, { folder: s.action.folder }); window.dispatchEvent(new Event("pip:changed")); }
    } catch { return; }
    drop(s.id);
  };
  if (!shown.length) return null;
  return <section className="sg" aria-label="Suggestions">
    <AnimatePresence initial={false}>{shown.map(s => <motion.div key={s.id} layout className="sg-i" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
      <i aria-hidden /><div><strong>{s.why}</strong><small>{s.action.type === "reminder" ? `Remind me ${when(s.action.at, now).toLowerCase()}` : s.action.type === "folder" ? `Move to ${s.action.folder}` : ""}</small></div>
      <button className="sg-ok" onClick={() => void accept(s)}>Add</button><button className="sg-no" onClick={() => drop(s.id)} aria-label="Dismiss">&#10005;</button>
    </motion.div>)}</AnimatePresence>
  </section>;
}

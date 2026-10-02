import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from "motion/react";
import { Pip } from "./components/Pip";
import { Capture } from "./components/Capture";
import { Editor } from "./components/Editor";
import { Settings } from "./components/Settings";
import { repo, useNotes } from "./useNotes";
import type { Note, View } from "./domain";

const TABS: { id: View; label: string }[] = [{ id: "all", label: "All notes" }, { id: "today", label: "Today" }, { id: "pinned", label: "Pinned" }, { id: "trash", label: "Trash" }];
const EMPTY: Record<View, { t: string; s: string }> = {
  all: { t: "Nothing kept yet", s: "Press the shortcut or use New note. Pip saves it locally." },
  today: { t: "Nothing from today", s: "Notes you create or edit today show up here." },
  pinned: { t: "No pinned notes", s: "Pin a note to keep it one tap away." },
  trash: { t: "Trash is empty", s: "Deleted notes wait here until you remove them for good." },
};
const when = (t: number) => {
  const d = new Date(t), n = new Date();
  return d.toDateString() === n.toDateString() ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};
const preview = (n: Note) => (n.body.replace(/\s+/g, " ").trim() || n.checklist.map(c => c.text).join(", ")).slice(0, 110);

export default function App() {
  const { view, setView, query, setQuery, notes, counts, prefs, setPrefs, refresh } = useNotes();
  const [selId, setSelId] = useState<string | null>(null);
  const [capture, setCapture] = useState(false);
  const [settings, setSettings] = useState(false);
  const [pane, setPane] = useState<"list" | "edit">("list");
  const [full, setFull] = useState<Note | null>(null);

  useEffect(() => {
    const dark = prefs.theme === "dark" || (prefs.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.motion = prefs.reducedMotion ? "reduced" : "full";
  }, [prefs.theme, prefs.reducedMotion]);

  useEffect(() => {
    const parts = prefs.shortcut.split("+"); const key = parts[parts.length - 1];
    const on = (e: KeyboardEvent) => {
      const k = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (k === key && e.ctrlKey === parts.includes("Ctrl") && e.shiftKey === parts.includes("Shift") && e.altKey === parts.includes("Alt")) { e.preventDefault(); setCapture(true); }
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, [prefs.shortcut]);

  const sel = useMemo(() => notes.find(n => n.id === selId) ?? null, [notes, selId]);
  useEffect(() => { if (selId && !notes.some(n => n.id === selId)) { setSelId(null); setPane("list"); } }, [notes, selId]);
  useEffect(() => { if (!selId) { setFull(null); return; } repo.get(selId).then(setFull).catch(() => setFull(null)); }, [selId, notes]);

  const newNote = async () => { const n = await repo.create({ title: "Untitled", body: "" }).catch(() => null); if (n) { setView("all"); setQuery(""); await refresh(); setSelId(n.id); setPane("edit"); } };
  const open = (id: string) => { setSelId(id); setPane("edit"); };
  const reduced = prefs.reducedMotion;

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}>
      <div className="app" data-pane={pane}>
        <aside className="side">
          <div className="brand"><Pip size={38} state="idle" /><div><h1>Pip</h1><p>Thought it? Keep it.</p></div></div>
          <button className="primary wide" onClick={() => setCapture(true)}>New capture</button>
          <p className="hint">or press {prefs.shortcut.replace(/\+/g, " + ")}</p>
          <nav aria-label="Views"><LayoutGroup>
            {TABS.map(t => (
              <button key={t.id} className={`tab ${view === t.id ? "on" : ""}`} aria-current={view === t.id ? "page" : undefined} onClick={() => { setView(t.id); setPane("list"); }}>
                {view === t.id && <motion.span layoutId="tab-pill" className="pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span className="tl">{t.label}</span><span className="ct">{counts[t.id]}</span>
              </button>))}
          </LayoutGroup></nav>
          <button className="ghost settings" onClick={() => setSettings(true)}>Settings</button>
        </aside>

        <section className="list" aria-label="Notes">
          <div className="list-top">
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title and text" aria-label="Search notes" />
            <button className="ghost" onClick={() => void newNote()}>New note</button>
          </div>
          <ul>
            <AnimatePresence initial={false}>
              {notes.map(n => (
                <motion.li key={n.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <button className={`item ${n.id === selId ? "on" : ""}`} onClick={() => open(n.id)}>
                    <span className="it-top"><b>{n.title}</b><time>{when(n.updatedAt)}</time></span>
                    <span className="it-pre">{preview(n) || "Empty note"}</span>
                    {n.pinned && <span className="pinmark" aria-label="Pinned" />}
                  </button>
                </motion.li>))}
            </AnimatePresence>
          </ul>
          {notes.length === 0 && (
            <div className="empty"><Pip size={72} state="capturing" />
              <h3>{query ? "No notes match" : EMPTY[view].t}</h3><p>{query ? "Try fewer words, or check another view." : EMPTY[view].s}</p></div>)}
        </section>

        <main className="pane">
          {sel && full && full.id === sel.id ? <Editor key={full.id} note={full} onChanged={() => void refresh()} onBack={() => setPane("list")} />
            : <div className="empty big"><Pip size={96} /><h3>Pick a note</h3><p>Or press <kbd>{prefs.shortcut.replace(/\+/g, " + ")}</kbd> to catch a new thought.</p></div>}
        </main>

        <Capture open={capture} onClose={() => setCapture(false)} onSaved={() => void refresh()} />
        {settings && <Settings prefs={prefs} setPrefs={setPrefs} onClose={() => setSettings(false)} onRestored={() => void refresh()} />}
      </div>
    </MotionConfig>
  );
}

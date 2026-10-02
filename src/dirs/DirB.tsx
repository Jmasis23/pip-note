import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Pip } from "../components/Pip";
import { Capture } from "../components/Capture";
import { Editor } from "../components/Editor";
import { Settings } from "../components/Settings";
import { repo, useNotes } from "../useNotes";
import type { Note, View } from "../domain";
import { preview, useFull, useTriggers, when } from "./util";
import "@fontsource-variable/bricolage-grotesque";
import "./b.css";

const VIEWS: { id: View; label: string }[] = [{ id: "all", label: "All" }, { id: "today", label: "Today" }, { id: "pinned", label: "Pinned" }, { id: "trash", label: "Trash" }];
const tone = (n: Note) => n.pinned ? "lav" : n.checklist.length ? "mint" : Date.now() - n.updatedAt < 864e5 ? "peach" : "white";

export default function DirB() {
  const { view, setView, query, setQuery, notes, counts, prefs, setPrefs, refresh } = useNotes();
  const [selId, setSelId] = useState<string | null>(null);
  const [capture, setCapture] = useState(false);
  const [settings, setSettings] = useState(false);
  useTriggers(prefs, () => setCapture(true), capture || settings);
  const full = useFull(selId, notes);

  return (
    <div className="db">
      <header className="db-hero">
        <div className="db-mascot"><Pip size={92} look /></div>
        <div>
          <h1>Thought it?<br />Keep it.</h1>
          <p>Shake the mouse, or press <kbd>{prefs.shortcut.replace(/\+/g, " + ")}</kbd></p>
        </div>
        <button className="db-gear" onClick={() => setSettings(true)} aria-label="Settings">Settings</button>
      </header>

      <LayoutGroup>
        <section className="db-board" aria-label="Notes">
          <AnimatePresence initial={false}>
            {notes.map((n, i) => (
              <motion.button key={n.id} layoutId={`card-${n.id}`} className={`db-card ${tone(n)}`} onClick={() => setSelId(n.id)}
                initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                whileHover={{ y: -4, rotate: i % 2 ? 0.5 : -0.5 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
                <b>{n.title}</b>
                <span className="db-pre">{preview(n) || "Empty note"}</span>
                {n.checklist.length > 0 && <span className="db-prog" aria-label={`${n.checklist.filter(c => c.done).length} of ${n.checklist.length} done`}>{n.checklist.map(c => <i key={c.id} className={c.done ? "d" : ""} />)}</span>}
                <time>{when(n.updatedAt)}</time>
              </motion.button>))}
          </AnimatePresence>
          {notes.length === 0 && <div className="db-empty"><Pip size={72} look /><p>{query ? "Nothing matches." : "Nothing kept yet."}</p></div>}
        </section>

        <AnimatePresence>
          {selId && (
            <motion.div className="db-veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) setSelId(null); }} onKeyDown={e => { if (e.key === "Escape") setSelId(null); }}>
              <motion.div layoutId={`card-${selId}`} className="db-sheet" transition={{ type: "spring", stiffness: 330, damping: 32 }}>
                {full && <Editor key={full.id} note={full} onChanged={() => void refresh()} onBack={() => setSelId(null)} />}
              </motion.div>
            </motion.div>)}
        </AnimatePresence>
      </LayoutGroup>

      <nav className="db-dock" aria-label="Views">
        <LayoutGroup id="dock">
          {VIEWS.map(v => (
            <button key={v.id} aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>
              {view === v.id && <motion.i layoutId="dock-on" className="db-dock-on" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
              <span>{v.label}</span><em>{counts[v.id]}</em>
            </button>))}
        </LayoutGroup>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search notes" />
        <button className="db-add" onClick={() => setCapture(true)} aria-label="New capture">Capture</button>
      </nav>

      <Capture open={capture} onClose={() => setCapture(false)} onSaved={() => void refresh()} />
      {settings && <Settings prefs={prefs} setPrefs={setPrefs} onClose={() => setSettings(false)} onRestored={() => void refresh()} />}
    </div>
  );
}
void repo;

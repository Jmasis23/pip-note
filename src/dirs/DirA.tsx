import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Pip } from "../components/Pip";
import { Capture } from "../components/Capture";
import { Editor } from "../components/Editor";
import { Settings } from "../components/Settings";
import { repo, useNotes } from "../useNotes";
import type { View } from "../domain";
import { preview, useFull, useTriggers, when } from "./util";
import "@fontsource-variable/figtree";
import "./a.css";

const VIEWS: { id: View; label: string }[] = [{ id: "all", label: "All notes" }, { id: "today", label: "Today" }, { id: "pinned", label: "Pinned" }, { id: "trash", label: "Trash" }];

export default function DirA() {
  const { view, setView, query, setQuery, notes, counts, prefs, setPrefs, refresh } = useNotes();
  const [selId, setSelId] = useState<string | null>(null);
  const [capture, setCapture] = useState(false);
  const [settings, setSettings] = useState(false);
  const [pane, setPane] = useState<"list" | "edit">("list");
  useTriggers(prefs, () => setCapture(true), capture || settings);
  useEffect(() => { if (!selId && notes[0] && matchMedia("(min-width:761px)").matches) setSelId(notes[0].id); }, [notes]);
  const full = useFull(selId, notes);
  const title = VIEWS.find(v => v.id === view)!.label;

  return (
    <div className="da" data-pane={pane}>
      <div className="da-island-slot">
        {!capture && (
          <motion.button className="da-pill" layout onClick={() => setCapture(true)} whileTap={{ scale: 0.96 }} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <Pip size={24} look /><span>Shake, or press {prefs.shortcut.replace(/\+/g, " ")}</span>
          </motion.button>)}
      </div>
      <div className="da-window">
        <aside className="da-side">
          <div className="da-brand"><Pip size={34} look /><b>Pip</b></div>
          <nav aria-label="Views"><LayoutGroup id="da">
            {VIEWS.map(v => (
              <button key={v.id} className="da-nav" aria-current={view === v.id ? "page" : undefined} onClick={() => { setView(v.id); setPane("list"); setSelId(null); }}>
                {view === v.id && <motion.i className="da-nav-bg" layoutId="da-nav-bg" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
                <span>{v.label}</span><em>{counts[v.id]}</em>
              </button>))}
          </LayoutGroup></nav>
          <button className="da-link" onClick={() => setSettings(true)}>Settings</button>
        </aside>

        <section className="da-list">
          <header><h1>{title}</h1><button className="da-new" onClick={async () => { const n = await repo.create({ title: "Untitled" }).catch(() => null); if (n) { setView("all"); await refresh(); setSelId(n.id); setPane("edit"); } }} aria-label="New note">New</button></header>
          <input className="da-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search notes" />
          <ul>
            <AnimatePresence initial={false}>
              {notes.map(n => (
                <motion.li key={n.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <button className={`da-row ${n.id === selId ? "on" : ""}`} onClick={() => { setSelId(n.id); setPane("edit"); }}>
                    <span className="da-row-top"><b>{n.title}</b><time>{when(n.updatedAt)}</time></span>
                    <span className="da-row-pre">{n.pinned && <i aria-label="Pinned" />}{preview(n) || "Empty note"}</span>
                  </button>
                </motion.li>))}
            </AnimatePresence>
          </ul>
          {notes.length === 0 && <p className="da-empty">{query ? "Nothing matches that." : "Nothing here yet. Shake the mouse to catch a thought."}</p>}
        </section>

        <main className="da-main">
          {full ? <Editor key={full.id} note={full} onChanged={() => void refresh()} onBack={() => setPane("list")} /> : <div className="da-blank"><Pip size={88} look /><p>Pick a note, or shake the mouse.</p></div>}
        </main>
      </div>
      <Capture open={capture} variant="island" onClose={() => setCapture(false)} onSaved={() => void refresh()} />
      {settings && <Settings prefs={prefs} setPrefs={setPrefs} onClose={() => setSettings(false)} onRestored={() => void refresh()} />}
    </div>
  );
}

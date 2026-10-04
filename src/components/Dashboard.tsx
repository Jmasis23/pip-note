import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Draft, Note, View } from "../domain";
import { Pip } from "./Pip";
import { dashboardModel, greeting } from "./dashboardModel";
import { preview, when } from "../dirs/util";
import "./dashboard.css";

type Props = {
  name?: string; notes: Note[]; drafts: Draft[]; loaded: boolean; shortcut: string;
  onCapture: (draftId?: string) => void; onOpen: (id: string) => void; onView: (view: View) => void;
};

function Arrow({ down = false }: { down?: boolean }) {
  return <svg className="home-arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d={down ? "M8 3v10M3 8l5 5 5-5" : "M3 13 13 3M4 3h9v9"} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Dashboard({ name, notes, drafts, loaded, shortcut, onCapture, onOpen, onView }: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const model = dashboardModel(notes, now);
  const draft = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const date = new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const tile = (note: Note, index: number) => <button key={note.id} className={`home-note home-tone-${index % 3}`} onClick={() => onOpen(note.id)} aria-label={`Open ${note.title}`}>
    <span className="home-note-folder">{note.folder || "A thought to keep"}</span>
    <h3>{note.title}</h3><p>{preview(note) || "Open your note to pick up where you left off."}</p>
    <span className="home-note-foot"><span>Pinned</span><time dateTime={new Date(note.updatedAt).toISOString()}>{when(note.updatedAt)}</time></span>
  </button>;

  return <motion.main className="home" aria-label="Your dashboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }}>
    <section className="home-welcome" aria-labelledby="home-greeting">
      <div className="home-welcome-copy"><p className="home-date">{date}</p><h1 id="home-greeting">{greeting(name)}<span className="home-greeting-dot">.</span></h1>
        <p className="home-intro">{loaded && model.total === 0 ? "A little space for your next big thought." : "Your thoughts, right where you left them."}</p>
      </div>
      <div className="home-welcome-actions"><Pip size={44} still />
        <button className="primary home-capture" onClick={() => onCapture()}>Capture a thought <span aria-hidden>＋</span></button>
        <p className="home-shortcut">Or press <kbd>{shortcut.replace(/\+/g, " + ")}</kbd></p>
      </div>
    </section>
    {!loaded ? <p className="home-loading" role="status">Getting your thoughts together…</p> : <>
      <div className="home-stats" role="group" aria-label="Your notes at a glance">
        <button onClick={() => onView("all")}><strong>{model.total}</strong><span>Notes kept</span><Arrow /></button>
        <button onClick={() => onView("today")}><strong>{model.today}</strong><span>New or edited today</span><Arrow /></button>
        <button onClick={() => document.getElementById("home-unfinished")?.scrollIntoView({ block: "nearest" })}><strong>{model.openItems}</strong><span>Checklist items open</span><Arrow down /></button>
      </div>
      {draft && <section className="home-draft" aria-label="Unfinished capture"><div><span className="home-eyebrow">A thought waiting for you</span><p>{draft.text.trim() || "Your unfinished capture"}</p></div><button className="ghost field" onClick={() => onCapture(draft.id)}>Resume draft</button></section>}
      <div className="home-lower">
        <section className="home-recent" aria-labelledby="home-recent-title"><div className="home-section-head"><h2 id="home-recent-title">Pick up where you left off</h2><button className="ghost field" onClick={() => onView("all")}>All notes</button></div>
          {model.recent.length ? <div className="home-recent-list">{model.recent.map(note => <button key={note.id} onClick={() => onOpen(note.id)} aria-label={`Open recent note: ${note.title}`}><span className="home-recent-icon"><Arrow /></span><span><strong>{note.title}</strong><small>{note.folder || "All notes"}</small></span><time dateTime={new Date(note.updatedAt).toISOString()}>{when(note.updatedAt)}</time></button>)}</div> : <p className="home-muted">Your recent notes will appear here.</p>}
        </section>
        <section id="home-unfinished" className="home-unfinished" aria-labelledby="home-unfinished-title"><div className="home-section-head"><h2 id="home-unfinished-title">Still on your list</h2></div>
          {model.unfinished.length ? <div className="home-check-list">{model.unfinished.map(note => <button key={note.id} onClick={() => onOpen(note.id)} aria-label={`Open checklist: ${note.title}`}><span className="home-check-box" aria-hidden/><span><strong>{note.checklist.find(item => !item.done)!.text}</strong><small>{note.title} · {note.checklist.filter(item => !item.done).length} left</small></span></button>)}</div> : <p className="home-muted">No unfinished checklist items. A little breathing room.</p>}
        </section>
      </div>
      {model.total === 0 ? <section className="home-first"><span className="home-eyebrow">Start small</span><h2>What's one thing you want to keep?</h2><p>An idea from a walk. A book to read. Something for tomorrow.<br/>Your first note can be anything.</p><button className="ghost field" onClick={() => onCapture()}>Keep your first thought</button></section> : <>
        <section className="home-pinned" aria-labelledby="home-pinned-title"><div className="home-section-head"><div><span className="home-eyebrow">Keep them close</span><h2 id="home-pinned-title">Pinned for you</h2></div><button className="ghost field" onClick={() => onView("pinned")}>All pinned notes</button></div>
          {model.pinned.length ? <div className="home-note-grid">{model.pinned.map(tile)}</div> : <div className="home-pin-empty"><p>A home for the notes you reach for most.</p><button className="ghost field" onClick={() => onView("all")}>Open a note to pin it</button></div>}
        </section>
      </>}
    </>}
    <p className="home-signoff">Need it later? Pip it.</p>
  </motion.main>;
}

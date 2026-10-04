import { useEffect, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { Draft, Note, View } from "../domain";
import { Pip } from "./Pip";
import { dashboardModel, greeting } from "./dashboardModel";
import { preview, when } from "../dirs/util";
import "./dashboard.css";

type Props = {
  name?: string; notes: Note[]; drafts: Draft[]; loaded: boolean; shortcut: string;
  onCapture: (draftId?: string) => void; onOpen: (id: string) => void; onView: (view: View) => void;
};

const spring = { type: "spring", stiffness: 260, damping: 26 } as const;
const list = { show: { transition: { staggerChildren: .06, delayChildren: .28 } } };
const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: spring } };

function Count({ to }: { to: number }) {
  const calm = useReducedMotion();
  const v = useMotionValue(calm ? to : 0);
  const text = useTransform(v, n => String(Math.round(n)));
  useEffect(() => { if (calm) { v.set(to); return; } const c = animate(v, to, { duration: .9, delay: .35, ease: [.22, 1, .36, 1] }); return () => c.stop(); }, [to, calm, v]);
  return <motion.strong>{text}</motion.strong>;
}

function Glyph({ kind }: { kind: "note" | "list" | "pin" }) {
  const d = kind === "list" ? "M4 5.5 5.6 7 8 4.2M4 11l1.6 1.5L8 9.7M10.5 5.8H15M10.5 11.3H15" : kind === "pin" ? "M9.5 2.8 13.2 6.5l-2 .8-2.4 2.7.4 2.2-1.1 1.1-2.3-2.3-3 3M9.5 2.8l-1.7 1.7-2.5.5-.6.6 5.2 5.2.6-.6.5-2.5" : "M4.5 3.5h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1ZM6 7h4M6 9.8h2.6";
  return <svg width="18" height="18" viewBox="0 0 17 17" aria-hidden><path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
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
  const empty = loaded && model.total === 0;
  const keys = shortcut.split("+");
  const tile = (note: Note) => <motion.button variants={rise} whileHover={{ y: -4 }} whileTap={{ scale: .985 }} transition={spring} key={note.id} className="home-note" onClick={() => onOpen(note.id)} aria-label={`Open ${note.title}`}>
    <span className="home-note-folder">{note.folder || "Pinned"}</span>
    <h3>{note.title}</h3><p>{preview(note) || "Open to pick up where you left off."}</p>
    <span className="home-note-foot"><i aria-hidden /><time dateTime={new Date(note.updatedAt).toISOString()}>{when(note.updatedAt)}</time></span>
  </motion.button>;

  return <motion.main className="home" aria-label="Your dashboard" data-empty={empty || undefined} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: .08 } } }}>
    <motion.section className="home-welcome" aria-labelledby="home-greeting" variants={{ hidden: { opacity: 0, scale: .985, y: 10 }, show: { opacity: 1, scale: 1, y: 0, transition: { ...spring, damping: 30 } } }}>
      <div className="home-welcome-copy">
        <p className="home-date">{date}</p>
        <h1 id="home-greeting">{greeting(name)}<span className="home-greeting-dot">.</span></h1>
        <p className="home-intro">{empty ? "Nothing kept yet." : "Your thoughts, where you left them."}</p>
      </div>
      <div className="home-welcome-actions">
        <span className="home-spark"><Pip size={96} /></span>
        <button className="home-capture" onClick={() => onCapture()}>{empty ? "What's one thing you want to keep?" : "Capture a thought"}<span className="home-keys" aria-label={`Shortcut ${shortcut}`}>{keys.map(k => <kbd key={k}>{k}</kbd>)}</span></button>
      </div>
      {loaded && !empty && <div className="home-stats" role="group" aria-label="Your notes at a glance">
        <button onClick={() => onView("all")}><Count to={model.total} /><span>kept</span></button>
        <button onClick={() => onView("today")}><Count to={model.today} /><span>touched today</span></button>
        <button onClick={() => document.getElementById("home-unfinished")?.scrollIntoView({ block: "nearest", behavior: "smooth" })}><Count to={model.openItems} /><span>to do</span></button>
      </div>}
    </motion.section>
    {!loaded ? <p className="home-loading" role="status">One moment…</p> : <>
      {draft && <motion.section className="home-draft" aria-label="Unfinished capture" variants={rise}><i aria-hidden /><div><span className="home-eyebrow">Unfinished</span><p>{draft.text.trim() || "Your unfinished capture"}</p></div><button className="home-pill" onClick={() => onCapture(draft.id)}>Resume draft</button></motion.section>}
      {!empty && <>
      <motion.div className="home-lower" variants={list}>
        <motion.section variants={rise} className="home-recent" aria-labelledby="home-recent-title"><div className="home-section-head"><h2 id="home-recent-title">Pick up where you left off</h2><button className="home-pill" onClick={() => onView("all")}>All notes</button></div>
          <div className="home-recent-list">{model.recent.map(note => <button key={note.id} onClick={() => onOpen(note.id)} aria-label={`Open recent note: ${note.title}`}><span className="home-recent-icon"><Glyph kind={note.pinned ? "pin" : note.checklist.length ? "list" : "note"} /></span><span><strong>{note.title}</strong><small>{note.folder || "All notes"}</small></span><time dateTime={new Date(note.updatedAt).toISOString()}>{when(note.updatedAt)}</time></button>)}</div>
        </motion.section>
        <motion.section variants={rise} id="home-unfinished" className="home-unfinished" aria-labelledby="home-unfinished-title"><div className="home-section-head"><h2 id="home-unfinished-title">Still on your list</h2></div>
          {model.unfinished.length ? <div className="home-check-list">{model.unfinished.map(note => <button key={note.id} onClick={() => onOpen(note.id)} aria-label={`Open checklist: ${note.title}`}><span className="home-check-box" aria-hidden/><span><strong>{note.checklist.find(item => !item.done)!.text}</strong><small>{note.title} · {note.checklist.filter(item => !item.done).length} left</small></span></button>)}</div> : <p className="home-muted">All clear.</p>}
        </motion.section>
      </motion.div>
      <motion.section className="home-pinned" aria-labelledby="home-pinned-title" variants={list}><motion.div variants={rise} className="home-section-head"><h2 id="home-pinned-title">Pinned</h2><button className="home-pill" onClick={() => onView("pinned")}>All pinned</button></motion.div>
        {model.pinned.length ? <div className="home-note-grid">{model.pinned.map(tile)}</div> : <motion.div variants={rise} className="home-pin-empty"><p>Pin a note to keep it here.</p><button className="home-pill" onClick={() => onView("all")}>Open a note</button></motion.div>}
      </motion.section>
      </>}
    </>}
    {!empty && <p className="home-signoff">Need it later? Pip it.</p>}
  </motion.main>;
}

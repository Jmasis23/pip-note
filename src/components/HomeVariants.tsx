import { motion } from "motion/react";
import type { Draft, Note, View } from "../domain";
import { Pip } from "./Pip";
import { dashboardModel } from "./dashboardModel";
import { dayLabel, preview, when } from "../dirs/util";
import "./home-variants.css";

export type HomeProps = { name?: string; notes: Note[]; drafts: Draft[]; loaded: boolean; shortcut: string; now: number; onCapture: (draftId?: string) => void; onOpen: (id: string) => void; onView: (view: View) => void };
const spring = { type: "spring", stiffness: 280, damping: 28 } as const;
const first = (n?: string) => n?.trim().split(/\s+/)[0] ?? "";
const part = (now: number) => { const h = new Date(now).getHours(); return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const Chev = () => <svg width="8" height="13" viewBox="0 0 8 13" aria-hidden><path d="M1.5 1.5 6.5 6.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Keys = ({ s }: { s: string }) => <span className="hv-keys">{s.split("+").map(k => <kbd key={k}>{k}</kbd>)}</span>;
const Box = ({ done }: { done?: boolean }) => <span className={done ? "hv-box on" : "hv-box"} aria-hidden />;

/** A: Paper. No panel. Type, one capture field, iOS inset lists. */
export function HomeA({ name, notes, drafts, loaded, shortcut, now, onCapture, onOpen, onView }: HomeProps) {
  const m = dashboardModel(notes, now); const draft = drafts[0]; const empty = loaded && m.total === 0;
  const todo = notes.filter(n => n.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt).flatMap(n => n.checklist.filter(c => !c.done).map(c => ({ n, c }))).slice(0, 5);
  return <motion.main className="hv hv-a" aria-label="Your dashboard" data-empty={empty || undefined} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
    <header><p>{new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p><h1>{part(now)}{first(name) ? `, ${first(name)}` : ""}</h1></header>
    <button className="hv-field" onClick={() => onCapture()}><Pip size={30} still /><span>{empty ? "What's one thing you want to keep?" : "Need it later? Pip it."}</span><Keys s={shortcut} /></button>
    {!empty && <p className="hv-line"><b>{m.total}</b> kept <i /> <b>{m.today}</b> touched today <i /> <b>{m.openItems}</b> to do</p>}
    {draft && <button className="hv-draft" onClick={() => onCapture(draft.id)}><span>Unfinished</span><em>{draft.text.trim()}</em><Chev /></button>}
    {!empty && <>
      {todo.length > 0 && <section id="home-unfinished" className="hv-today"><h2>Today<em>{m.openItems} to do</em></h2><div className="hv-group">{todo.map(({ n, c }) => <button key={n.id + c.id} onClick={() => onOpen(n.id)} aria-label={`Open checklist: ${n.title}`}><Box /><span><strong>{c.text}</strong><small>{n.title}</small></span><Chev /></button>)}</div></section>}
      <section><h2>Pinned</h2><div className="hv-shelf">{m.pinned.map((n, i) => <motion.button key={n.id} className="hv-sheet" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: .15 + i * .06 }} whileHover={{ y: -5, rotate: i % 2 ? .6 : -.6 }} onClick={() => onOpen(n.id)} aria-label={`Open ${n.title}`}><i /><h3>{n.title}</h3><p>{preview(n)}</p><time>{when(n.updatedAt)}</time></motion.button>)}</div></section>
      <section><h2>Recent</h2><div className="hv-group">{m.recent.map(n => <button key={n.id} onClick={() => onOpen(n.id)} aria-label={`Open recent note: ${n.title}`}><span><strong>{n.title}</strong><small>{preview(n) || n.folder || "Note"}</small></span><time>{when(n.updatedAt)}</time><Chev /></button>)}</div><button className="hv-more" onClick={() => onView("all")}>All notes</button></section>
    </>}
  </motion.main>;
}

/** B: Widgets. A bento of iOS-style tiles, no hero. */
export function HomeB({ name, notes, drafts, loaded, shortcut, now, onCapture, onOpen, onView }: HomeProps) {
  const m = dashboardModel(notes, now); const empty = loaded && m.total === 0; const top = m.pinned[0] ?? m.recent[0]; const draft = drafts[0];
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(now - (6 - i) * 864e5).toDateString(); return notes.filter(n => n.deletedAt === null && new Date(n.updatedAt).toDateString() === d).length; });
  const max = Math.max(1, ...week); const done = notes.reduce((s, n) => s + n.checklist.filter(c => c.done).length, 0); const all = done + m.openItems;
  const tile = (i: number) => ({ initial: { opacity: 0, scale: .94, y: 12 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { ...spring, delay: .05 + i * .05 }, whileHover: { y: -3 } });
  return <main className="hv hv-b" aria-label="Your dashboard" data-empty={empty || undefined}>
    <header><h1>{first(name) ? `Hi, ${first(name)}` : "Hi there"}</h1><p>{new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p></header>
    <div className="hv-bento">
      <motion.button {...tile(0)} className="w cap" onClick={() => onCapture()}><Pip size={64} /><strong>{empty ? "Keep your first thought" : "Capture"}</strong><Keys s={shortcut} /></motion.button>
      {empty ? <motion.div {...tile(1)} className="w hint"><p>Nothing here yet.</p><small>Notes, checklists and pins show up as tiles.</small></motion.div> : <>
      {top && <motion.button {...tile(1)} className="w note" onClick={() => onOpen(top.id)} aria-label={`Open ${top.title}`}><small>{top.pinned ? "Pinned" : "Latest"}</small><h3>{top.title}</h3><p>{preview(top)}</p><time>{when(top.updatedAt)}</time></motion.button>}
      <motion.button {...tile(2)} className="w ring" onClick={() => onView("today")}><svg viewBox="0 0 80 80" aria-hidden><circle cx="40" cy="40" r="32" /><circle cx="40" cy="40" r="32" className="v" pathLength="100" strokeDasharray={`${all ? Math.round(done / all * 100) : 0} 100`} /></svg><strong>{m.openItems}</strong><span>to do</span></motion.button>
      <motion.button {...tile(3)} className="w bars" onClick={() => onView("all")}><strong>{m.total}</strong><span>kept</span><div aria-hidden>{week.map((c, i) => <i key={i} style={{ height: `${14 + c / max * 70}%` }} className={i === 6 ? "t" : ""} />)}</div></motion.button>
      <motion.section {...tile(4)} className="w list" id="home-unfinished" aria-label="Still on your list"><h2>Still on your list</h2>{m.unfinished.length ? m.unfinished.map(n => <button key={n.id} onClick={() => onOpen(n.id)} aria-label={`Open checklist: ${n.title}`}><Box /><span><strong>{n.checklist.find(c => !c.done)!.text}</strong><small>{n.title}</small></span></button>) : <p>All clear.</p>}</motion.section>
      <motion.section {...tile(5)} className="w recent" aria-label="Recent"><h2>Recent</h2>{m.recent.slice(0, 3).map(n => <button key={n.id} onClick={() => onOpen(n.id)} aria-label={`Open recent note: ${n.title}`}><strong>{n.title}</strong><time>{when(n.updatedAt)}</time></button>)}</motion.section>
      {draft && <motion.button {...tile(6)} className="w draft" onClick={() => onCapture(draft.id)}><small>Unfinished</small><em>{draft.text.trim()}</em></motion.button>}</>}
    </div>
  </main>;
}

/** C: Stream. The page is one prompt and a timeline of days. */
export function HomeC({ name, notes, drafts, loaded, shortcut, now, onCapture, onOpen, onView }: HomeProps) {
  const m = dashboardModel(notes, now); const empty = loaded && m.total === 0; const draft = drafts[0];
  const days: [string, Note[]][] = []; [...notes].filter(n => n.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8).forEach(n => { const l = dayLabel(n.updatedAt); const g = days.find(d => d[0] === l); g ? g[1].push(n) : days.push([l, [n]]); });
  return <main className="hv hv-c" aria-label="Your dashboard" data-empty={empty || undefined}>
    <motion.button className="hv-prompt" onClick={() => onCapture()} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <small>{first(name) ? `${first(name)}, ` : ""}{new Date(now).toLocaleDateString([], { weekday: "long" })}</small>
      <span>{empty ? "What's one thing you want to keep" : "What's on your mind"}<b className="hv-caret" aria-hidden /></span>
      <Keys s={shortcut} />
    </motion.button>
    {draft && <button className="hv-draft" onClick={() => onCapture(draft.id)}><span>Unfinished</span><em>{draft.text.trim()}</em></button>}
    {!empty && <div className="hv-stream">
      <div className="hv-rail" aria-hidden />
      {days.map(([label, list], gi) => <section key={label}><motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .2 + gi * .1 }}><i />{label}</motion.h2>
        {list.map((n, i) => { const open = n.checklist.filter(c => !c.done); return <motion.button key={n.id} className="hv-entry" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: .25 + gi * .1 + i * .05 }} onClick={() => onOpen(n.id)} aria-label={`Open recent note: ${n.title}`}>
          <time>{new Date(n.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
          <span><strong>{n.pinned && <em className="hv-pin" aria-label="Pinned" />}{n.title}</strong>{preview(n) && <small>{preview(n)}</small>}
            {open.length > 0 && <span className="hv-todo">{open.slice(0, 2).map(c => <span key={c.id}><Box />{c.text}</span>)}{open.length > 2 && <span className="hv-more2">+{open.length - 2} more</span>}</span>}</span></motion.button>; })}
      </section>)}
      <button className="hv-more" onClick={() => onView("all")}>All notes</button>
    </div>}
  </main>;
}

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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

/** B: Widgets. A customizable bento of iOS-style tiles, no hero. */
type Size = "s" | "m" | "l";
type Slot = { id: string; size: Size };
const WIDGETS: Record<string, { label: string; sizes: Size[] }> = {
  capture: { label: "Capture", sizes: ["s", "m"] },
  pinned: { label: "Pinned note", sizes: ["l", "m"] },
  latest: { label: "Latest note", sizes: ["m", "l"] },
  todo: { label: "To do ring", sizes: ["s", "m"] },
  kept: { label: "Kept this week", sizes: ["s", "m"] },
  list: { label: "Checklist", sizes: ["l", "m"] },
  recent: { label: "Recent", sizes: ["l", "m"] },
  date: { label: "Today", sizes: ["s", "m"] },
};
const DEFAULT: Slot[] = [{ id: "pinned", size: "l" }, { id: "todo", size: "s" }, { id: "kept", size: "s" }, { id: "capture", size: "s" }, { id: "date", size: "s" }, { id: "list", size: "l" }, { id: "recent", size: "l" }];
const KEY = "pip.home.layout.v2";
const loadLayout = (): Slot[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (Array.isArray(v)) return v.filter((x: Slot) => WIDGETS[x?.id] && WIDGETS[x.id].sizes.includes(x.size)); } catch { /* ignore */ } return DEFAULT; };

export function HomeB({ name, notes, drafts, loaded, shortcut, now, onCapture, onOpen, onView }: HomeProps) {
  const m = dashboardModel(notes, now); const empty = loaded && m.total === 0; const draft = drafts[0];
  const [layout, setLayout] = useState<Slot[]>(loadLayout); const [edit, setEdit] = useState(false); const [drag, setDrag] = useState<string | null>(null);
  const save = (next: Slot[]) => { setLayout(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } };
  const move = (id: string, to: number) => { const i = layout.findIndex(x => x.id === id); if (i < 0 || to < 0 || to >= layout.length || i === to) return; const n = [...layout]; const [it] = n.splice(i, 1); n.splice(to, 0, it); save(n); };
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(now - (6 - i) * 864e5).toDateString(); return notes.filter(n => n.deletedAt === null && new Date(n.updatedAt).toDateString() === d).length; });
  const max = Math.max(1, ...week); const done = notes.reduce((s, n) => s + n.checklist.filter(c => c.done).length, 0); const all = done + m.openItems;
  const pin = m.pinned[0] ?? m.recent[0]; const latest = m.recent[0];
  const noteTile = (n: typeof pin, label: string) => n ? <button className="w note" onClick={() => onOpen(n.id)} aria-label={`Open ${n.title}`}><small>{label}</small><h3>{n.title}</h3><p>{preview(n)}</p><time>{when(n.updatedAt)}</time></button> : <div className="w hint"><p>Nothing yet.</p></div>;
  const body = (id: string, size: Size) => {
    switch (id) {
      case "capture": return <button className="w cap" onClick={() => onCapture()}><Pip size={64} /><strong>{empty ? "Keep your first thought" : "Capture"}</strong><Keys s={shortcut} /></button>;
      case "pinned": return noteTile(m.pinned[0], "Pinned");
      case "latest": return noteTile(latest, "Latest");
      case "todo": return <button className="w ring" onClick={() => onView("today")}><svg viewBox="0 0 80 80" aria-hidden><circle cx="40" cy="40" r="32" /><circle cx="40" cy="40" r="32" className="v" pathLength="100" strokeDasharray={`${all ? Math.round(done / all * 100) : 0} 100`} /></svg><strong>{m.openItems}</strong><span>to do</span></button>;
      case "kept": return <button className="w bars" onClick={() => onView("all")}><strong>{m.total}</strong><span>kept</span><div aria-hidden>{week.map((c, i) => <i key={i} style={{ height: `${14 + c / max * 70}%` }} className={i === 6 ? "t" : ""} />)}</div></button>;
      case "list": return <section className="w list" id="home-unfinished" aria-label="Still on your list"><h2>Still on your list</h2>{m.unfinished.length ? m.unfinished.slice(0, size === "l" ? 5 : 2).map(n => <button key={n.id} onClick={() => onOpen(n.id)} aria-label={`Open checklist: ${n.title}`}><Box /><span><strong>{n.checklist.find(c => !c.done)!.text}</strong><small>{n.title}</small></span></button>) : <p>All clear.</p>}</section>;
      case "recent": return <section className="w recent" aria-label="Recent"><h2>Recent</h2>{m.recent.slice(0, size === "l" ? 5 : 3).map(n => <button key={n.id} onClick={() => onOpen(n.id)} aria-label={`Open recent note: ${n.title}`}><strong>{n.title}</strong><time>{when(n.updatedAt)}</time></button>)}</section>;
      default: { const d = new Date(now); return <div className="w date"><small>{d.toLocaleDateString([], { weekday: "long" })}</small><strong>{d.getDate()}</strong><span>{d.toLocaleDateString([], { month: "long" })}</span></div>; }
    }
  };
  const hidden = Object.keys(WIDGETS).filter(id => !layout.some(x => x.id === id));
  const rm = (id: string) => save(layout.filter(x => x.id !== id));
  const resize = (id: string) => save(layout.map(x => { if (x.id !== id) return x; const z = WIDGETS[id].sizes; return { ...x, size: z[(z.indexOf(x.size) + 1) % z.length] }; }));
  const slots = empty ? [{ id: "capture", size: "m" as Size }] : layout;
  return <main className="hv hv-b" aria-label="Your dashboard" data-empty={empty || undefined} data-edit={edit || undefined}>
    <header><h1>{first(name) ? `Hi, ${first(name)}` : "Hi there"}</h1><p>{new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p>{!empty && <button className="hv-edit" onClick={() => setEdit(e => !e)} aria-pressed={edit}>{edit ? "Done" : "Customize"}</button>}</header>
    <div className="hv-bento">
      {slots.map((sl, i) => <motion.div layout key={sl.id} transition={spring} className={`wrap s-${sl.size}`} initial={{ opacity: 0, scale: .94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} whileHover={edit ? undefined : { y: -3 }}
        draggable={edit} onDragStart={() => setDrag(sl.id)} onDragEnd={() => setDrag(null)} onDragOver={e => { if (edit && drag && drag !== sl.id) { e.preventDefault(); move(drag, i); } }} data-drag={drag === sl.id || undefined}>
        <div className="inner" {...(edit ? { inert: "" as unknown as boolean } : {})}>{body(sl.id, sl.size)}</div>
        {edit && <div className="ctl" role="group" aria-label={WIDGETS[sl.id].label}>
          <button className="rm" onClick={() => rm(sl.id)} aria-label={`Remove ${WIDGETS[sl.id].label}`}>−</button>
          <span><button onClick={() => move(sl.id, i - 1)} disabled={i === 0} aria-label="Move earlier">←</button><button onClick={() => move(sl.id, i + 1)} disabled={i === slots.length - 1} aria-label="Move later">→</button>{WIDGETS[sl.id].sizes.length > 1 && <button onClick={() => resize(sl.id)} aria-label="Change size">{sl.size.toUpperCase()}</button>}</span>
        </div>}
      </motion.div>)}
      {empty && <motion.div className="wrap s-m" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><div className="w hint"><p>Nothing here yet.</p><small>Notes, checklists and pins show up as tiles.</small></div></motion.div>}
      {!empty && draft && !edit && <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w draft" onClick={() => onCapture(draft.id)}><small>Unfinished</small><em>{draft.text.trim()}</em></motion.button>}
    </div>
    <AnimatePresence>{edit && <motion.section className="hv-tray" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} aria-label="Add widgets"><h2>Add</h2>
      {hidden.length ? <div>{hidden.map(id => <button key={id} onClick={() => save([...layout, { id, size: WIDGETS[id].sizes[0] }])}><b>+</b>{WIDGETS[id].label}</button>)}</div> : <p>Every widget is on.</p>}
      <button className="hv-reset" onClick={() => save(DEFAULT)}>Reset layout</button></motion.section>}</AnimatePresence>
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

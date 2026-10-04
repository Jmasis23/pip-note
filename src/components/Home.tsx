import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import type { Draft, Note, View } from "../domain";
import { Pip } from "./Pip";
import { dashboardModel } from "./dashboardModel";
import { preview, when } from "../dirs/util";
import "./home.css";

export type HomeProps = { name?: string; notes: Note[]; drafts: Draft[]; loaded: boolean; shortcut: string; now: number; onCapture: (draftId?: string) => void; onOpen: (id: string) => void; onView: (view: View) => void };
const spring = { type: "spring", stiffness: 280, damping: 28 } as const;
const first = (n?: string) => n?.trim().split(/\s+/)[0] ?? "";
const Keys = ({ s }: { s: string }) => <span className="hv-keys">{s.split("+").map(k => <kbd key={k}>{k}</kbd>)}</span>;
const Box = ({ done }: { done?: boolean }) => <span className={done ? "hv-box on" : "hv-box"} aria-hidden />;

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
  date: { label: "Today", sizes: ["m", "s"] },
};
const DEFAULT: Slot[] = [{ id: "pinned", size: "l" }, { id: "todo", size: "s" }, { id: "kept", size: "s" }, { id: "date", size: "m" }, { id: "list", size: "l" }, { id: "recent", size: "l" }];
const KEY = "pip.home.layout.v3";
const loadLayout = (): Slot[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (Array.isArray(v)) { const seen = new Set<string>(); return v.filter((x: Slot) => { const ok = x && WIDGETS[x.id] && WIDGETS[x.id].sizes.includes(x.size) && !seen.has(x.id); if (ok) seen.add(x.id); return ok; }); } } catch { /* ignore */ } return DEFAULT; };
const Head = ({ label }: { label: string }) => <span className="th"><i aria-hidden />{label}</span>;

export function Home({ name, notes, drafts, loaded, shortcut, now, onCapture, onOpen, onView }: HomeProps) {
  const m = dashboardModel(notes, now); const empty = loaded && m.total === 0;
  const draft = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const [layout, setLayout] = useState<Slot[]>(loadLayout); const [edit, setEdit] = useState(false); const [drag, setDrag] = useState<string | null>(null);
  const live = useRef(layout); live.current = layout;
  const save = (next: Slot[]) => { live.current = next; setLayout(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } };
  const reorder = (id: string, to: number) => { const cur = live.current; const i = cur.findIndex(x => x.id === id); if (i < 0 || to < 0 || to >= cur.length || i === to) return; const n = [...cur]; const [it] = n.splice(i, 1); n.splice(to, 0, it); live.current = n; setLayout(n); };
  const move = (id: string, to: number) => { reorder(id, to); save(live.current); };
  useEffect(() => { if (!edit) return; const f = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setEdit(false); } }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [edit]);
  const inertRef = (el: HTMLDivElement | null) => { if (!el) return; if (el.dataset.inert === "1") el.setAttribute("inert", ""); else el.removeAttribute("inert"); };
  const active = notes.filter(n => n.deletedAt === null);
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(now - (6 - i) * 864e5).toDateString(); return active.filter(n => new Date(n.updatedAt).toDateString() === d).length; });
  const max = Math.max(1, ...week); const done = active.reduce((s, n) => s + n.checklist.filter(c => c.done).length, 0); const all = done + m.openItems;
  const latest = m.recent[0]; const pin = m.pinned[0];
  const items = [...active].sort((a, b) => b.updatedAt - a.updatedAt).flatMap(n => n.checklist.filter(c => !c.done).map(c => ({ n, c })));
  const noteTile = (n: typeof pin, label: string, size: Size) => n ? <button className="w note" onClick={() => onOpen(n.id)} aria-label={`Open ${n.title}`}><Head label={label} /><h3>{n.title}</h3><p>{n.body.trim()}</p>{size === "l" && n.checklist.filter(c => !c.done).slice(0, 3).map(c => <span key={c.id} className="nl"><Box />{c.text}</span>)}<time>{when(n.updatedAt)}</time></button> : <div className="w hint"><p>Nothing yet.</p></div>;
  const body = (id: string, size: Size) => {
    switch (id) {
      case "capture": return <button className="w cap" onClick={() => onCapture()}><Pip size={64} /><strong>{empty ? "Keep your first thought" : "Capture"}</strong><Keys s={shortcut} /></button>;
      case "pinned": return noteTile(pin, "Pinned", size);
      case "latest": return noteTile(latest, "Latest", size);
      case "todo": return <button className="w ring" onClick={() => onView("today")}><Head label="To do" /><svg viewBox="0 0 80 80" aria-hidden><circle cx="40" cy="40" r="32" /><circle cx="40" cy="40" r="32" className="v" pathLength="100" strokeDasharray={`${all ? Math.round(done / all * 100) : 0} 100`} /></svg><strong>{m.openItems}</strong><span>open</span></button>;
      case "kept": return <button className="w bars" onClick={() => onView("all")}><Head label="Kept" /><strong>{m.total}</strong><span>this week</span><div aria-hidden>{week.map((c, i) => <i key={i} style={{ height: `${14 + c / max * 70}%` }} className={i === 6 ? "t" : ""} />)}</div></button>;
      case "list": return <section className="w list" id="home-unfinished" aria-label="Still on your list"><Head label="Still on your list" />{items.length ? items.slice(0, size === "l" ? 6 : 2).map(({ n, c }) => <button key={n.id + c.id} onClick={() => onOpen(n.id)} aria-label={`Open checklist: ${n.title}`}><Box /><span><strong>{c.text}</strong><small>{n.title}</small></span></button>) : <p>All clear.</p>}</section>;
      case "recent": return <section className="w recent" aria-label="Recent"><Head label="Recent" />{m.recent.slice(0, size === "l" ? 4 : 3).map(n => <button key={n.id} onClick={() => onOpen(n.id)} aria-label={`Open recent note: ${n.title}`}><span><strong>{n.title}</strong><small>{preview(n) || n.folder || "Note"}</small></span><time>{when(n.updatedAt)}</time></button>)}</section>;
      default: { const d = new Date(now); return <div className="w date"><Head label={d.toLocaleDateString([], { weekday: "long" })} /><strong>{d.getDate()}</strong><span>{d.toLocaleDateString([], { month: "long", year: "numeric" })}</span>{size === "m" && <Keys s={shortcut} />}</div>; }
    }
  };
  const hidden = Object.keys(WIDGETS).filter(id => !layout.some(x => x.id === id));
  const rm = (id: string) => save(layout.filter(x => x.id !== id));
  const resize = (id: string) => save(layout.map(x => { if (x.id !== id) return x; const z = WIDGETS[id].sizes; return { ...x, size: z[(z.indexOf(x.size) + 1) % z.length] }; }));
  const slots: Slot[] = empty ? [{ id: "capture", size: "m" }] : layout;
  return <MotionConfig reducedMotion="user"><main className="hv hv-b" aria-label="Your dashboard" data-empty={empty || undefined} data-edit={edit || undefined}>
    <header><h1>{first(name) ? `Hi, ${first(name)}` : "Hi there"}</h1><p>{new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p>{!empty && <button className="hv-edit" onClick={() => setEdit(e => !e)} aria-pressed={edit}>{edit ? "Done" : "Customize"}</button>}</header>
    <div className="hv-bento">
      {!loaded && [0, 1, 2, 3].map(i => <div key={i} className={`wrap s-${i === 0 ? "l" : "s"}`}><div className="w skel" aria-hidden /></div>)}
      {loaded && slots.map((sl, i) => <div key={sl.id} className={`wrap s-${sl.size}`} draggable={edit}
        onDragStart={e => { e.dataTransfer.setData("text/plain", sl.id); e.dataTransfer.effectAllowed = "move"; setDrag(sl.id); }}
        onDragEnd={() => { setDrag(null); save(live.current); }}
        onDragOver={e => { if (!edit || !drag || drag === sl.id) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); if (Math.abs(e.clientX - (r.left + r.width / 2)) < r.width / 4 && Math.abs(e.clientY - (r.top + r.height / 2)) < r.height / 4) reorder(drag, i); }}
        onDrop={e => e.preventDefault()} data-drag={drag === sl.id || undefined}>
        <motion.div layout transition={spring} className="mo" initial={{ opacity: 0, scale: .94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} whileHover={edit ? undefined : { y: -3 }}>
          <div className="inner" ref={inertRef} data-inert={edit ? "1" : undefined}>{body(sl.id, sl.size)}</div>
          {edit && <div className="ctl" role="group" aria-label={WIDGETS[sl.id].label}>
            <button className="rm" onClick={() => rm(sl.id)} aria-label={`Remove ${WIDGETS[sl.id].label}`}>−</button>
            <span><button onClick={() => move(sl.id, i - 1)} aria-disabled={i === 0} aria-label="Move earlier">←</button><button onClick={() => move(sl.id, i + 1)} aria-disabled={i === slots.length - 1} aria-label="Move later">→</button>{WIDGETS[sl.id].sizes.length > 1 && <button onClick={() => resize(sl.id)} aria-label="Change size">{sl.size.toUpperCase()}</button>}</span>
          </div>}
        </motion.div>
      </div>)}
      {empty && <div className="wrap s-m"><div className="w hint"><p>Nothing here yet.</p><small>Notes, checklists and pins show up as tiles.</small></div></div>}
      {loaded && !empty && !slots.length && <div className="wrap s-l"><div className="w hint"><p>No widgets.</p><small>{edit ? "Add one below." : "Tap Customize to add some."}</small></div></div>}
      {loaded && !empty && draft && !edit && <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w draft" onClick={() => onCapture(draft.id)}><small>Unfinished</small><em>{draft.text.trim() || "Your unfinished capture"}</em></motion.button>}
    </div>
    <AnimatePresence>{edit && <motion.section className="hv-tray" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} aria-label="Add widgets"><h2>Add</h2>
      {hidden.length ? <div>{hidden.map(id => <button key={id} onClick={() => save([...layout, { id, size: WIDGETS[id].sizes[0] }])}><b>+</b>{WIDGETS[id].label}</button>)}</div> : <p>Every widget is on.</p>}
      <button className="hv-reset" onClick={() => save(DEFAULT)}>Reset layout</button></motion.section>}</AnimatePresence>
  </main></MotionConfig>;
}


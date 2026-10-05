import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** Home: a widget bento. In Customize, drag a tile to move it and pull its corner to resize it. */
type Size = "s" | "m" | "l";
type Slot = { id: string; w: number; h: number };
const MAXW = 4, MAXH = 3, ROW = 176, GAP = 16;
const WIDGETS: Record<string, { label: string; min: [number, number] }> = {
  capture: { label: "Capture", min: [1, 1] },
  pinned: { label: "Pinned note", min: [2, 1] },
  latest: { label: "Latest note", min: [2, 1] },
  todo: { label: "To do ring", min: [1, 1] },
  kept: { label: "Kept this week", min: [1, 1] },
  list: { label: "Checklist", min: [2, 1] },
  recent: { label: "Recent", min: [2, 1] },
  date: { label: "Today", min: [1, 1] },
};
const DEFAULT: Slot[] = [{ id: "pinned", w: 2, h: 2 }, { id: "todo", w: 1, h: 1 }, { id: "kept", w: 1, h: 1 }, { id: "date", w: 2, h: 1 }, { id: "list", w: 2, h: 2 }, { id: "recent", w: 2, h: 2 }];
const KEY = "pip.home.layout.v4";
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const sizeOf = (w: number, h: number): Size => w * h >= 4 ? "l" : w * h >= 2 ? "m" : "s";
const loadLayout = (): Slot[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(v)) { const seen = new Set<string>(); return v.filter((x: Slot) => { const k = x && WIDGETS[x.id]; const ok = !!k && Number.isInteger(x.w) && Number.isInteger(x.h) && x.w >= 1 && x.w <= MAXW && x.h >= 1 && x.h <= MAXH && !seen.has(x.id); if (ok) seen.add(x.id); return ok; }); }
  } catch { /* ignore */ }
  return DEFAULT;
};
const Head = ({ label }: { label: string }) => <span className="th"><i aria-hidden />{label}</span>;

export function Home({ name, notes, drafts, loaded, shortcut, now, onCapture, onOpen, onView }: HomeProps) {
  const m = dashboardModel(notes, now); const empty = loaded && m.total === 0;
  const draft = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const [layout, setLayout] = useState<Slot[]>(loadLayout); const [edit, setEdit] = useState(false); const [drag, setDrag] = useState<string | null>(null);
  const live = useRef(layout); live.current = layout;
  const save = (next: Slot[]) => { live.current = next; setLayout(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } };
  const grid = useRef<HTMLDivElement>(null); const [cols, setCols] = useState(4);
  const act = useRef<{ kind: "move" | "size"; id: string; gx: number; gy: number; tx: number; ty: number } | null>(null);
  useEffect(() => { const el = grid.current; if (!el) return; const f = () => setCols(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(" ").length)); f(); const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect(); }, []);
  // Slide neighbours into their new place instead of snapping.
  const rects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const el = grid.current; if (!el) return; const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.querySelectorAll<HTMLElement>(".wrap[data-id]").forEach(w => {
      const id = w.dataset.id!; const was = rects.current.get(id); const now2 = w.getBoundingClientRect(); rects.current.set(id, now2);
      if (!was || calm || act.current?.id === id || w.getAnimations().length) return;
      const dx = was.left - now2.left, dy = was.top - now2.top; if (Math.abs(dx) + Math.abs(dy) < 2) return;
      const base = w.style.transform; w.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "translate(0,0)" }], { duration: 240, easing: "cubic-bezier(.22,1,.36,1)" }); void base;
    });
  });
  const reorder = (id: string, to: number) => { const cur = live.current; const i = cur.findIndex(x => x.id === id); if (i < 0 || to < 0 || to >= cur.length || i === to) return; const n = [...cur]; const [it] = n.splice(i, 1); n.splice(to, 0, it); live.current = n; setLayout(n); };
  const place = (id: string, w: number, h: number) => { const k = WIDGETS[id].min; const cw = clamp(w, k[0], Math.min(MAXW, Math.max(cols, k[0]))), ch = clamp(h, k[1], MAXH); const cur = live.current; const x = cur.find(q => q.id === id); if (!x || (x.w === cw && x.h === ch)) return; const n = cur.map(q => q.id === id ? { ...q, w: cw, h: ch } : q); live.current = n; setLayout(n); };
  const wrapOf = (id: string) => grid.current?.querySelector<HTMLElement>(`.wrap[data-id="${id}"]`) ?? null;
  const down = (e: React.PointerEvent, id: string, kind: "move" | "size") => {
    if (!edit || e.button !== 0) return; if (kind === "move" && (e.target as HTMLElement).closest(".rm,.rz")) return;
    const w = wrapOf(id); if (!w) return; e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = w.getBoundingClientRect(); act.current = { kind, id, gx: e.clientX - r.left, gy: e.clientY - r.top, tx: 0, ty: 0 }; setDrag(id);
  };
  const moveTo = (e: React.PointerEvent) => {
    const a = act.current; if (!a) return; const w = wrapOf(a.id); const g = grid.current; if (!w || !g) return;
    if (a.kind === "size") {
      const gr = g.getBoundingClientRect(); const cw = (gr.width - GAP * (cols - 1)) / cols; const r = w.getBoundingClientRect();
      place(a.id, Math.round((e.clientX - r.left + GAP) / (cw + GAP)), Math.round((e.clientY - r.top + GAP) / (ROW + GAP))); return;
    }
    w.style.transform = ""; const r = w.getBoundingClientRect();
    a.tx = e.clientX - a.gx - r.left; a.ty = e.clientY - a.gy - r.top; w.style.transform = `translate(${a.tx}px,${a.ty}px) scale(1.03)`;
    const under = document.elementsFromPoint(e.clientX, e.clientY).map(el => (el as HTMLElement).closest?.(".wrap[data-id]") as HTMLElement | null).find(el => el && el.dataset.id !== a.id);
    if (under) { const to = live.current.findIndex(x => x.id === under.dataset.id); const ur = under.getBoundingClientRect(); if (Math.abs(e.clientX - (ur.left + ur.width / 2)) < ur.width * .4 && Math.abs(e.clientY - (ur.top + ur.height / 2)) < ur.height * .4) reorder(a.id, to); }
  };
  const up = () => { const a = act.current; if (!a) return; const w = wrapOf(a.id); act.current = null; setDrag(null); if (w) { const r0 = w.getBoundingClientRect(); w.style.transform = ""; const r1 = w.getBoundingClientRect(); if (a.kind === "move" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) w.animate([{ transform: `translate(${r0.left - r1.left}px,${r0.top - r1.top}px) scale(1.03)` }, { transform: "translate(0,0) scale(1)" }], { duration: 220, easing: "cubic-bezier(.22,1,.36,1)" }); } save(live.current); };
  const key = (e: React.KeyboardEvent, sl: Slot, i: number) => {
    if (!edit || (e.target as HTMLElement) !== e.currentTarget || !e.key.startsWith("Arrow")) return; e.preventDefault();
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -2 : 2;
    if (e.shiftKey) { if (e.key === "ArrowLeft" || e.key === "ArrowRight") place(sl.id, sl.w + d, sl.h); else place(sl.id, sl.w, sl.h + (e.key === "ArrowDown" ? 1 : -1)); save(live.current); }
    else { reorder(sl.id, i + d); save(live.current); requestAnimationFrame(() => wrapOf(sl.id)?.focus()); }
  };
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
  const slots: Slot[] = empty ? [{ id: "capture", w: 2, h: 1 }] : layout;
  return <MotionConfig reducedMotion="user"><main className="hv hv-b" aria-label="Your dashboard" data-empty={empty || undefined} data-edit={edit || undefined}>
    <header><h1>{first(name) ? `Hi, ${first(name)}` : "Hi there"}</h1><p>{new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p>{!empty && <button className="hv-edit" onClick={() => setEdit(e => !e)} aria-pressed={edit}>{edit ? "Done" : "Customize"}</button>}</header>
    <div className="hv-bento" ref={grid}>
      {!loaded && [0, 1, 2, 3].map(i => <div key={i} className={`wrap s-${i === 0 ? "l" : "s"}`}><div className="w skel" aria-hidden /></div>)}
      {loaded && slots.map((sl, i) => { const w = Math.min(sl.w, cols); const z = sizeOf(w, sl.h); return <div key={sl.id} data-id={sl.id} className={`wrap s-${z}`} style={{ gridColumn: `span ${w}`, gridRow: `span ${sl.h}` }}
        tabIndex={edit ? 0 : undefined} aria-label={edit ? `${WIDGETS[sl.id].label}. Arrow keys move it, Shift plus arrows resize it.` : undefined}
        onPointerDown={e => down(e, sl.id, "move")} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up} onKeyDown={e => key(e, sl, i)} data-drag={drag === sl.id || undefined}>
        <motion.div className="mo" initial={{ opacity: 0, scale: .94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} whileHover={edit ? undefined : { y: -3 }}>
          <div className="inner" ref={inertRef} data-inert={edit ? "1" : undefined}>{body(sl.id, z)}</div>
          {edit && <div className="ctl">
            <button className="rm" onClick={() => rm(sl.id)} aria-label={`Remove ${WIDGETS[sl.id].label}`}>−</button>
            <i className="rz" onPointerDown={e => down(e, sl.id, "size")} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up} aria-hidden />
          </div>}
        </motion.div>
      </div>; })}
      {empty && <div className="wrap s-m"><div className="w hint"><p>Nothing here yet.</p><small>Notes, checklists and pins show up as tiles.</small></div></div>}
      {loaded && !empty && !slots.length && <div className="wrap s-l"><div className="w hint"><p>No widgets.</p><small>{edit ? "Add one below." : "Tap Customize to add some."}</small></div></div>}
      {loaded && !empty && draft && !edit && <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w draft" onClick={() => onCapture(draft.id)}><small>Unfinished</small><em>{draft.text.trim() || "Your unfinished capture"}</em></motion.button>}
    </div>
    <AnimatePresence>{edit && <motion.section className="hv-tray" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} aria-label="Add widgets"><h2>Add</h2>
      {hidden.length ? <div>{hidden.map(id => <button key={id} onClick={() => save([...layout, { id, w: Math.max(WIDGETS[id].min[0], 2), h: 1 }])}><b>+</b>{WIDGETS[id].label}</button>)}</div> : <p>Every widget is on.</p>}
      <button className="hv-reset" onClick={() => save(DEFAULT)}>Reset layout</button></motion.section>}</AnimatePresence>
  </main></MotionConfig>;
}


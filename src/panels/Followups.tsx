import { useState } from "react";
import { Panel } from "./Panel";
import { FOLLOWUPS_KEY, isOverdue, newId, useList, type Followup } from "./store";
import "./panels.css";
export function Followups({ onClose }: { onClose: () => void }) {
  const [items, commit] = useList<Followup>(FOLLOWUPS_KEY);
  const [text, setText] = useState(""); const [due, setDue] = useState(""); const [showDone, setShowDone] = useState(false);
  const add = () => { const t = text.trim(); if (!t) return; commit([{ id: newId(), text: t.slice(0, 500), due, done: false, createdAt: Date.now() }, ...items]); setText(""); setDue(""); };
  const open = items.filter(f => !f.done).sort((a, b) => (a.due || "9999") .localeCompare(b.due || "9999") || b.createdAt - a.createdAt);
  const done = items.filter(f => f.done);
  const row = (f: Followup) => <li key={f.id} className={isOverdue(f) ? "late" : ""}><label><input type="checkbox" checked={f.done} onChange={() => commit(items.map(x => x.id === f.id ? { ...x, done: !x.done } : x))} /><span>{f.text}</span></label>
    <div className="pn-act">{f.due && <span className="pn-due">{isOverdue(f) ? "Overdue · " : ""}{f.due}</span>}<button className="ghost field" aria-label={`Delete ${f.text}`} onClick={() => commit(items.filter(x => x.id !== f.id))}>Delete</button></div></li>;
  return <Panel title="Follow-ups" sub="Things to come back to." onClose={onClose}>
    <div className="pn-form"><div className="pn-row"><input aria-label="Follow-up" placeholder="What to follow up on" value={text} maxLength={500} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} /><input type="date" aria-label="Due date" value={due} onChange={e => setDue(e.target.value)} /><button className="primary" onClick={add}>Keep it</button></div></div>
    <ul className="pn-list">{open.map(row)}</ul>
    {open.length === 0 && <p className="pn-empty">Nothing waiting. Add something to come back to.</p>}
    {done.length > 0 && <><button className="ghost field" aria-expanded={showDone} onClick={() => setShowDone(s => !s)}>{showDone ? "Hide" : "Show"} done ({done.length})</button>{showDone && <ul className="pn-list">{done.map(row)}</ul>}</>}
  </Panel>;
}

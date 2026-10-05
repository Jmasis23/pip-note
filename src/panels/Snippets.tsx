import { useState } from "react";
import { Panel } from "./Panel";
import { newId, SNIPPETS_KEY, useList, type Snippet } from "./store";
import "./panels.css";
export function Snippets({ onClose }: { onClose: () => void }) {
  const [items, commit] = useList<Snippet>(SNIPPETS_KEY);
  const [q, setQ] = useState(""); const [name, setName] = useState(""); const [text, setText] = useState(""); const [msg, setMsg] = useState("");
  const shown = items.filter(s => (s.name + " " + s.text).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt);
  const add = () => { const n = name.trim(), t = text.trim(); if (!n || !t) { setMsg("Give it a name and some text."); return; } commit([{ id: newId(), name: n.slice(0, 60), text: t.slice(0, 20000), updatedAt: Date.now() }, ...items]); setName(""); setText(""); setMsg("Kept."); };
  const copy = async (s: Snippet) => { try { await navigator.clipboard.writeText(s.text); setMsg(`Copied "${s.name}".`); } catch { setMsg("Couldn't copy. Select the text and copy it by hand."); } };
  return <Panel title="Snippets" sub="Text you reuse. Copy it in one click." onClose={onClose}>
    <div className="pn-form"><input aria-label="Snippet name" placeholder="Name, like Email signature" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
      <textarea aria-label="Snippet text" placeholder="The text to reuse" value={text} onChange={e => setText(e.target.value)} rows={3} />
      <div className="pn-row"><span role="status" className="pn-msg">{msg}</span><button className="primary" onClick={add}>Keep it</button></div></div>
    {items.length > 0 && <input type="search" aria-label="Search snippets" placeholder="Search snippets" value={q} onChange={e => setQ(e.target.value)} />}
    <ul className="pn-list">{shown.map(s => <li key={s.id}><div><b>{s.name}</b><p>{s.text.length > 140 ? s.text.slice(0, 140) + "…" : s.text}</p></div>
      <div className="pn-act"><button className="ghost field" onClick={() => void copy(s)}>Copy</button><button className="ghost field" aria-label={`Delete ${s.name}`} onClick={() => commit(items.filter(x => x.id !== s.id))}>Delete</button></div></li>)}</ul>
    {items.length === 0 && <p className="pn-empty">No snippets yet. Add the text you keep retyping.</p>}
  </Panel>;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { call, initStorage, isNative, kv, onNativeEvent } from "./native";
import { repo } from "./useNotes";
import { readList, SNIPPETS_KEY, type Snippet } from "./panels/store";
import { recallResults, projectShelves, type RecallItem, type Shelf } from "./panels/recall";
import { clipboard, type ClipItem } from "./clipboard";
import { counts, UTILS } from "./panels/utilities";
import { FOLLOWUPS_KEY, isOverdue, type Followup } from "./panels/store";
import "@fontsource-variable/inter";
import "./dirs/b.css";
import "./panels/panels.css";

/** The one compact window every non-capture tool shows in. The native side says which tool through tool_current. */
export default function ToolWindow() {
  const [tool, setTool] = useState("");
  const refresh = useCallback(async () => { try { await initStorage(); } catch { /* keep the old view */ } setTool(isNative() ? await call<string>("tool_current") : (new URLSearchParams(location.search).get("tool") || "recall").replace(/^1$/, "recall")); }, []);
  useEffect(() => {
    document.documentElement.classList.add("cap-win");
    void refresh(); let off = () => {}; let dead = false;
    if (isNative()) void onNativeEvent("pip://tool-show", () => void refresh()).then(f => { if (dead) f(); else off = f; });
    return () => { dead = true; off(); };
  }, [refresh]);
  const close = () => { if (isNative()) void call("tool_hide"); };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  return <div className="db db-pop"><div className="db-sheet panel tool-win" role="dialog" aria-label={tool === "recall" ? "Quick Recall" : tool === "clipboard" ? "Clipboard Shelf" : tool === "project" ? "Project Shelf" : tool === "utilities" ? "Quick Utilities" : tool === "resume" ? "Resume Cards" : tool === "snippets" ? "Snippets" : tool === "followups" ? "Follow-ups" : "Pip tool"}>
    {tool === "recall" ? <Recall onDone={close} /> : tool === "clipboard" ? <ClipShelf onDone={close} /> : tool === "project" ? <ProjectShelf onDone={close} /> : tool === "utilities" ? <Utilities onDone={close} /> : tool === "resume" ? <Resume onDone={close} /> : tool === "snippets" ? <SnippetPick onDone={close} /> : tool === "followups" ? <FollowupGlance onDone={close} /> : <p className="pn-empty">This tool is not ready yet.</p>}
  </div></div>;
}

function Recall({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState(""); const [items, setItems] = useState<RecallItem[]>([]); const [at, setAt] = useState(0); const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null); const gen = useRef(0);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { const my = ++gen.current; void (async () => {
    const notes = await repo.list({ view: "all", query: "" }); if (my !== gen.current) return;
    setItems(recallResults(notes, readList<Snippet>(SNIPPETS_KEY), q)); setAt(0);
  })(); }, [q]);
  const pick = async (it: RecallItem | undefined) => {
    if (!it) return;
    try { await navigator.clipboard.writeText(it.text); setMsg("Copied."); window.setTimeout(onDone, 350); } catch { setMsg("Couldn't copy. Open it in Pip instead."); }
  };
  return <>
    <header className="panel-head"><div><h2>Quick Recall</h2></div><button className="ghost" onClick={onDone}>Done</button></header>
    <input ref={input} type="search" aria-label="Search what you kept" placeholder="Search what you kept" value={q} onChange={e => setQ(e.target.value)}
      onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setAt(a => Math.min(a + 1, items.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setAt(a => Math.max(a - 1, 0)); } else if (e.key === "Enter") { e.preventDefault(); void pick(items[at]); } }} />
    <ul className="pn-list" role="listbox" aria-label="Results">{items.map((it, i) => <li key={it.kind + it.id} role="option" aria-selected={i === at} className={i === at ? "sel" : ""} onClick={() => void pick(it)}><div><b>{it.title}</b><p>{it.kind === "snippet" ? "Snippet" : "Note"} · {it.text.replace(/\s+/g, " ").slice(0, 70)}</p></div></li>)}</ul>
    {items.length === 0 && <p className="pn-empty">{q ? "Nothing matches." : "Nothing kept yet."}</p>}
    <p className="pn-msg" role="status">{msg || "Arrow keys to move, Enter to copy, Esc to close."}</p>
  </>;
}

/** Clipboard Shelf: recent copies from the existing clipboard history. Click puts one back on the clipboard; Keep it saves one as a note. */
function ClipShelf({ onDone }: { onDone: () => void }) {
  const [items, setItems] = useState<ClipItem[]>([]); const [on, setOn] = useState(false); const [supported, setSupported] = useState(true); const [msg, setMsg] = useState("");
  const load = useCallback(async () => { try { const st = await clipboard.status(); setItems(st.items.slice(0, 8)); setOn(st.enabled); setSupported(st.supported); } catch { setMsg("Couldn't read clipboard history."); } }, []);
  useEffect(() => { void load(); let off = () => {}; let dead = false; if (isNative()) void clipboard.watch(() => void load()).then(f => { if (dead) f(); else off = f; }); return () => { dead = true; off(); }; }, [load]);
  const use = async (it: ClipItem) => { try { await clipboard.copy(it.id); setMsg("Back on your clipboard."); window.setTimeout(onDone, 350); } catch { setMsg("Couldn't copy that one."); } };
  const keep = async (it: ClipItem) => { try { await repo.create({ body: (it.text || "").slice(0, 20000) }); if (isNative()) await call("capture_saved"); setMsg("Kept."); } catch { setMsg("Couldn't keep that."); } };
  return <>
    <header className="panel-head"><div><h2>Clipboard Shelf</h2></div><button className="ghost" onClick={onDone}>Done</button></header>
    {!supported && <p className="pn-empty">Clipboard history only runs in the Windows app.</p>}
    {supported && !on && <p className="pn-empty">Clipboard history is paused. Turn it on from Clipboard in the main app.</p>}
    <ul className="pn-list">{items.filter(i => !i.image).map(it => <li key={it.id}><div><b>{it.text.replace(/\s+/g, " ").slice(0, 60)}</b></div><div className="pn-act"><button className="ghost field" onClick={() => void use(it)}>Use</button><button className="ghost field" onClick={() => void keep(it)}>Keep it</button></div></li>)}</ul>
    {supported && on && items.length === 0 && <p className="pn-empty">Nothing copied yet.</p>}
    <p className="pn-msg" role="status">{msg || "Saved unencrypted on this PC. Pause it for secrets."}</p>
  </>;
}

/** Project Shelf: your projects (top-level folders) and their newest notes. Click a note to copy its text. */
function ProjectShelf({ onDone }: { onDone: () => void }) {
  const [shelves, setShelves] = useState<Shelf[]>([]); const [open, setOpen] = useState(""); const [msg, setMsg] = useState("");
  useEffect(() => { void (async () => { try { await initStorage(); } catch { /* use what is loaded */ } const s = projectShelves(await repo.list({ view: "all", query: "" })); setShelves(s); setOpen(s[0]?.folder ?? ""); })(); }, []);
  const cur = shelves.find(s => s.folder === open);
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setMsg("Copied."); window.setTimeout(onDone, 350); } catch { setMsg("Couldn't copy."); } };
  return <>
    <header className="panel-head"><div><h2>Project Shelf</h2></div><button className="ghost" onClick={onDone}>Done</button></header>
    <div className="pn-row" role="group" aria-label="Projects" style={{ flexWrap: "wrap" }}>{shelves.map(s => <button key={s.folder} className="db-chip" aria-pressed={open === s.folder} onClick={() => setOpen(s.folder)}>{s.folder} {s.notes.length}</button>)}</div>
    <ul className="pn-list">{(cur?.notes ?? []).slice(0, 8).map(n => <li key={n.id} role="option" aria-selected={false} style={{ cursor: "pointer" }} onClick={() => void copy(n.body)}><div><b>{n.title || n.body.split("\n")[0].slice(0, 60) || "Untitled"}</b><p>{n.body.replace(/\s+/g, " ").slice(0, 70)}</p></div></li>)}</ul>
    {shelves.length === 0 && <p className="pn-empty">No projects yet. Put a note in a folder to start one.</p>}
    <p className="pn-msg" role="status">{msg || "Click a note to copy it."}</p>
  </>;
}

/** Quick Utilities: transform the text on your clipboard, then it goes straight back to the clipboard. */
function Utilities({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState(""); const [msg, setMsg] = useState("");
  const paste = async () => { try { setText(await navigator.clipboard.readText()); setMsg(""); } catch { setMsg("Couldn't read the clipboard. Paste into the box instead."); } };
  useEffect(() => { void paste(); }, []);
  const apply = async (u: (typeof UTILS)[number]) => { const out = u.run(text); setText(out); try { await navigator.clipboard.writeText(out); setMsg(`${u.label}: copied.`); } catch { setMsg("Done, but couldn't copy. Select the text and copy it."); } };
  const c = counts(text);
  return <>
    <header className="panel-head"><div><h2>Quick Utilities</h2></div><button className="ghost" onClick={onDone}>Done</button></header>
    <textarea className="pn-ta" aria-label="Text" value={text} onChange={e => setText(e.target.value)} rows={5} placeholder="Copy some text, or type here" />
    <p className="pn-msg">{c.words} words · {c.chars} characters · {c.lines} lines</p>
    <div className="pn-row" style={{ flexWrap: "wrap" }}>{UTILS.map(u => <button key={u.id} className="ghost field" disabled={!text} onClick={() => void apply(u)}>{u.label}</button>)}</div>
    <p className="pn-msg" role="status">{msg}</p>
  </>;
}

/** Resume Cards: where you left off. Your newest notes and the follow-ups still open. */
function Resume({ onDone }: { onDone: () => void }) {
  const [notes, setNotes] = useState<{ id: string; title: string; when: string }[]>([]); const [fu, setFu] = useState<Followup[]>([]);
  useEffect(() => { void (async () => { try { await initStorage(); } catch { /* use what is loaded */ } const all = await repo.list({ view: "all", query: "" }); setNotes(all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3).map(n => ({ id: n.id, title: n.title || n.body.split("\n")[0].slice(0, 60) || "Untitled", when: new Date(n.updatedAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) }))); setFu(readList<Followup>(FOLLOWUPS_KEY).filter(f => !f.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 4)); })(); }, []);
  return <>
    <header className="panel-head"><div><h2>Where you left off</h2></div><button className="ghost" onClick={onDone}>Done</button></header>
    <h3 className="pn-h">Last edited</h3><ul className="pn-list">{notes.map(n => <li key={n.id}><div><b>{n.title}</b><p>{n.when}</p></div></li>)}</ul>
    {notes.length === 0 && <p className="pn-empty">Nothing kept yet.</p>}
    <h3 className="pn-h">Still open</h3><ul className="pn-list">{fu.map(f => <li key={f.id} className={isOverdue(f) ? "late" : ""}><div><b>{f.text}</b>{f.due && <p>{isOverdue(f) ? "Overdue · " : ""}{f.due}</p>}</div></li>)}</ul>
    {fu.length === 0 && <p className="pn-empty">No open follow-ups.</p>}
  </>;
}

/** Snippets in the compact window: click one to copy it. Adding and editing happen in the main app. */
function SnippetPick({ onDone }: { onDone: () => void }) {
  const [items, setItems] = useState<Snippet[]>([]); const [q, setQ] = useState(""); const [msg, setMsg] = useState("");
  useEffect(() => { void (async () => { try { await initStorage(); } catch { /* use what is loaded */ } setItems(readList<Snippet>(SNIPPETS_KEY).sort((a, b) => b.updatedAt - a.updatedAt)); })(); }, []);
  const copy = async (s: Snippet) => { try { await navigator.clipboard.writeText(s.text); setMsg(`Copied "${s.name}".`); window.setTimeout(onDone, 350); } catch { setMsg("Couldn't copy."); } };
  const shown = items.filter(s => (s.name + " " + s.text).toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  return <>
    <header className="panel-head"><div><h2>Snippets</h2></div><button className="ghost" onClick={onDone}>Done</button></header>
    <input type="search" autoFocus aria-label="Search snippets" placeholder="Search snippets" value={q} onChange={e => setQ(e.target.value)} />
    <ul className="pn-list">{shown.map(s => <li key={s.id} role="option" aria-selected={false} style={{ cursor: "pointer" }} onClick={() => void copy(s)}><div><b>{s.name}</b><p>{s.text.replace(/\s+/g, " ").slice(0, 70)}</p></div></li>)}</ul>
    {items.length === 0 && <p className="pn-empty">No snippets yet. Add them from Snippets in the main app.</p>}
    <p className="pn-msg" role="status">{msg || "Click a snippet to copy it."}</p>
  </>;
}

/** Follow-ups at a glance: tick one off without opening the app. */
function FollowupGlance({ onDone }: { onDone: () => void }) {
  const [items, setItems] = useState<Followup[]>([]);
  useEffect(() => { void (async () => { try { await initStorage(); } catch { /* use what is loaded */ } setItems(readList<Followup>(FOLLOWUPS_KEY)); })(); }, []);
  const toggle = (id: string) => { const next = items.map(f => f.id === id ? { ...f, done: !f.done } : f); setItems(next); kv.setItem(FOLLOWUPS_KEY, JSON.stringify(next)); };
  const open = items.filter(f => !f.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 8);
  return <>
    <header className="panel-head"><div><h2>Follow-ups</h2></div><button className="ghost" onClick={onDone}>Done</button></header>
    <ul className="pn-list">{open.map(f => <li key={f.id} className={isOverdue(f) ? "late" : ""}><label><input type="checkbox" checked={false} onChange={() => toggle(f.id)} /><span>{f.text}</span></label>{f.due && <span className="pn-due">{isOverdue(f) ? "Overdue · " : ""}{f.due}</span>}</li>)}</ul>
    {open.length === 0 && <p className="pn-empty">Nothing waiting.</p>}
  </>;
}

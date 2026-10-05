import { useCallback, useEffect, useRef, useState } from "react";
import { call, initStorage, isNative, onNativeEvent } from "./native";
import { repo } from "./useNotes";
import { readList, SNIPPETS_KEY, type Snippet } from "./panels/store";
import { recallResults, type RecallItem } from "./panels/recall";
import "@fontsource-variable/inter";
import "./dirs/b.css";
import "./panels/panels.css";

/** The one compact window every non-capture tool shows in. The native side says which tool through tool_current. */
export default function ToolWindow() {
  const [tool, setTool] = useState("");
  const refresh = useCallback(async () => { try { await initStorage(); } catch { /* keep the old view */ } setTool(isNative() ? await call<string>("tool_current") : "recall"); }, []);
  useEffect(() => {
    document.documentElement.classList.add("cap-win");
    void refresh(); let off = () => {}; let dead = false;
    if (isNative()) void onNativeEvent("pip://tool-show", () => void refresh()).then(f => { if (dead) f(); else off = f; });
    return () => { dead = true; off(); };
  }, [refresh]);
  const close = () => { if (isNative()) void call("tool_hide"); };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  return <div className="db db-pop"><div className="db-sheet panel tool-win" role="dialog" aria-label={tool === "recall" ? "Quick Recall" : "Pip tool"}>
    {tool === "recall" ? <Recall onDone={close} /> : <p className="pn-empty">This tool is not ready yet.</p>}
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

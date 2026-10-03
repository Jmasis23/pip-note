import { imageNote } from "../images";
import { useEffect, useRef, useState } from "react";
import { clipboard, type ClipStatus } from "../clipboard";
import { onNativeEvent, isNative } from "../native";
import { repo } from "../useNotes";
export function Clipboard({ onClose, onKept }: { onClose: () => void; onKept: () => void }) {
  const [st, setSt] = useState<ClipStatus>({ enabled: false, items: [], supported: false });
  const [q, setQ] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const reload = async () => { setSt(await clipboard.status()); setLoaded(true); };
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null; root.current?.focus();
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", escape);
    let dead = false; const offs: (() => void)[] = [];
    void reload().catch(() => setMsg("Couldn't read clipboard history. Close and try again."));
    if (isNative()) for (const task of [clipboard.watch(() => void reload().catch(() => setMsg("Couldn't refresh history."))), onNativeEvent("pip://clipboard-error", () => { setMsg("Clipboard history stopped. Close and reopen Pip to retry."); void reload(); })]) void task.then(off => { if (dead) off(); else offs.push(off); });
    return () => { window.removeEventListener("keydown", escape); dead = true; offs.forEach(off => off()); prev?.focus(); };
  }, []);
  const run = async (f: () => Promise<void>, text = "") => { setBusy(true); setMsg(""); try { await f(); await reload(); setMsg(text); } catch (e) { setMsg(String(e)); } finally { setBusy(false); } };
  const items = st.items.filter(i => (i.image ? "image screenshot" : i.text).toLocaleLowerCase().includes(q.toLocaleLowerCase()));
  return <div className="db-veil" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="db-sheet clip" role="dialog" aria-modal="true" aria-label="Clipboard history" tabIndex={-1} ref={root} onKeyDown={e => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") { const els = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input')]; const first = els[0], last = els.at(-1); if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    }}>
      <header className="clip-head"><div><h2>Clipboard</h2></div><button className="ghost" onClick={onClose}>Done</button></header>
      <div className="clip-control"><div><b>{st.enabled ? "Remembering copied items" : "Clipboard history is paused"}</b></div><button className="ghost field" disabled={busy || !loaded || !st.supported} aria-pressed={st.enabled} onClick={() => void run(() => clipboard.enable(!st.enabled))}>{st.enabled ? "Pause" : "Enable history"}</button></div>
      <p className="clip-warning">Saved unencrypted on this PC. Pause for secrets; "Keep as note" syncs.</p>
      <div className="clip-tools"><input type="search" aria-label="Search clipboard" placeholder="Search text or images" value={q} onChange={e => setQ(e.target.value)} /><span>{st.items.filter(i => !i.image).length}/50 texts · {st.items.filter(i => i.image).length}/10 images</span><button className="ghost danger" disabled={busy || !st.items.length} onClick={() => { if (confirm("Clear clipboard history on this PC? Notes are untouched.")) void run(() => clipboard.remove(null), "History cleared."); }}>Clear all</button></div>
      <div className="clip-list">{items.map(i => <article className="clip-item" key={i.id}>{i.image ? <img className="clip-image" src={i.image} alt="Copied image" loading="lazy" /> : <pre>{i.text}</pre>}<footer><time dateTime={new Date(i.copiedAt).toISOString()}>{new Date(i.copiedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><div><button className="ghost field" disabled={busy} onClick={() => void run(() => clipboard.copy(i.id), "Copied. Switch to your app and paste.")}>Copy</button><button className="ghost field" disabled={busy} onClick={() => void run(async () => { await repo.create(i.image ? imageNote(i.image) : { body: i.text }); onKept(); }, "Kept as a note.")}>Keep as note</button><button className="ghost" disabled={busy} aria-label={i.image ? "Delete copied image" : `Delete copied text: ${i.text.slice(0, 30)}`} onClick={() => void run(() => clipboard.remove(i.id))}>Delete</button></div></footer></article>)}
      {!items.length && <div className="clip-empty"><h3>{q ? "No matching items" : "Nothing copied here yet"}</h3></div>}</div>
    </div>
  </div>;
}

import { useEffect, useRef, useState } from "react";
import type { ChecklistItem, Note } from "../domain";
import { ConflictError } from "../domain";
import { repo } from "../useNotes";
import { cleanFolder } from "../repo/repo";
import { plainToRich, richToPlain, sanitizeRich } from "../rich";
import { RichBody } from "./RichBody";
import type { RichHandle } from "./RichBody";
import { AiError, cleanUp, suggestMeta, useAi } from "../ai";

type Save = "idle" | "pending" | "saved" | "error";
const uid = () => crypto.randomUUID();
const download = (name: string, text: string, type: string) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
};

export function Editor({ note, folders = [], onChanged, onBack }: { note: Note; folders?: string[]; onChanged: () => void; onBack: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [rich, setRich] = useState(note.rich ?? plainToRich(note.body));
  const [seed, setSeed] = useState(0);
  const [items, setItems] = useState<ChecklistItem[]>(note.checklist);
  const [save, setSave] = useState<Save>("idle");
  const [conflict, setConflict] = useState<Note | null>(null);
  const [err, setErr] = useState("");
  const rev = useRef(note.revision);
  const timer = useRef<number>();
  const dirty = useRef(false);
  const latest = useRef({ title, body, rich, items });
  latest.current = { title, body, rich, items };
  const locked = note.deletedAt !== null;
  const ai = useAi();
  const richRef = useRef<RichHandle>(null);
  const [busy, setBusy] = useState<"" | "meta" | "clean">("");
  const [aiMsg, setAiMsg] = useState("");
  const [sug, setSug] = useState<{ title: string; folder: string } | null>(null);
  useEffect(() => { setSug(null); setAiMsg(""); setBusy(""); }, [note.id]);
  const runAi = async (kind: "meta" | "clean") => {
    if (!ai || busy) return; setBusy(kind); setAiMsg(""); setSug(null);
    try {
      const text = latest.current.body.trim() || latest.current.items.map(i => i.text).join("\n");
      if (!text) { setAiMsg("Write something first."); return; }
      if (kind === "meta") { const all = await repo.list({ view: "all", query: "" }); const r = await suggestMeta(ai, text, [...new Set(all.map(n => n.folder).filter((f): f is string => !!f))]); if (!r.title && !r.folder) setAiMsg("No suggestion this time."); else setSug(r); }
      else { const out = await cleanUp(ai, latest.current.body); if (out) { richRef.current?.replaceAll(out); setAiMsg("Tidied. Ctrl+Z puts it back."); } }
    } catch (e) { setAiMsg(e instanceof AiError ? e.message : "AI hit a snag. Your note is untouched."); } finally { setBusy(""); }
  };
  const [folder, setFolder] = useState(note.folder ?? "");
  useEffect(() => setFolder(note.folder ?? ""), [note.id, note.folder]);
  const moveTo = async () => { const f = cleanFolder(folder); setFolder(f); if (f === (note.folder ?? "")) return; await flush(); try { const n = await repo.update(note.id, rev.current, { folder: f }); rev.current = n.revision; onChanged(); } catch { setErr("Couldn't move it."); setSave("error"); } };

  useEffect(() => { setTitle(note.title); setBody(note.body); setRich(note.rich ?? plainToRich(note.body)); setSeed(x => x + 1); setItems(note.checklist); rev.current = note.revision; setSave("idle"); setConflict(null); setErr(""); dirty.current = false; }, [note.id]);
  useEffect(() => {
    if (!dirty.current && !conflict) { setTitle(note.title); setBody(note.body); setRich(note.rich ?? plainToRich(note.body)); setItems(note.checklist); rev.current = note.revision; }
  }, [note.revision]);

  const flush = async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current || locked) return;
    const { title, body, rich, items } = latest.current;
    try {
      const n = await repo.update(note.id, rev.current, { title, body, rich, checklist: items });
      rev.current = n.revision; dirty.current = false; setSave("saved"); setErr(""); onChanged();
    } catch (e) {
      if (e instanceof ConflictError) { setConflict(e.latest); setSave("error"); }
      else { setSave("error"); setErr("Couldn't save. Your text is still here."); }
    }
  };
  const touch = () => { dirty.current = true; setSave("pending"); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void flush(), 600); };
  useEffect(() => () => { window.clearTimeout(timer.current); if (dirty.current) void flush(); }, [note.id]);

  const toggle = (id: string) => { setItems(a => a.map(i => i.id === id ? { ...i, done: !i.done } : i)); touch(); };
  const edit = (id: string, text: string) => { setItems(a => a.map(i => i.id === id ? { ...i, text } : i)); touch(); };
  const add = () => { setItems(a => [...a, { id: uid(), text: "", done: false }]); touch(); setTimeout(() => document.querySelector<HTMLInputElement>(".check-row:last-of-type input[type=text]")?.focus(), 0); };
  const remove = (id: string) => { setItems(a => a.filter(i => i.id !== id)); touch(); };

  const saveAsCopy = async () => { await repo.create({ title: `${title} (my version)`, body, rich, checklist: items }); setConflict(null); dirty.current = false; onChanged(); };
  const reload = () => { if (!conflict) return; setTitle(conflict.title); setBody(conflict.body); setRich(conflict.rich ?? plainToRich(conflict.body)); setSeed(x => x + 1); setItems(conflict.checklist); rev.current = conflict.revision; dirty.current = false; setConflict(null); setSave("idle"); onChanged(); };

  const label = locked ? "In Trash" : save === "pending" ? "Saving" : save === "saved" ? "Saved" : save === "error" ? (err || "Not saved") : "";

  return (
    <section className="editor" onBlur={() => void flush()} aria-label="Note editor">
      <div className="ed-bar">
        <button className="ghost back" onClick={onBack} aria-label="Back to notes">Notes</button>
        <span className={`status ${save === "error" ? "bad" : ""}`} role="status" aria-live="polite">{label}</span>
        <div className="ed-actions">
          {locked ? (<>
            <button className="ghost" onClick={async () => { await repo.restore(note.id); onChanged(); }}>Restore</button>
            <button className="ghost danger" onClick={async () => { if (confirm("Delete this note forever? This can't be undone.")) { await repo.deleteForever(note.id); onChanged(); } }}>Delete forever</button>
          </>) : (<>
            <button className="ghost" aria-pressed={note.pinned} onClick={async () => { await flush(); await repo.setPinned(note.id, !note.pinned); onChanged(); }}>{note.pinned ? "Unpin" : "Pin"}</button>
            <button className="ghost" onClick={async () => { const m = await repo.exportMarkdown(note.id); download(m.filename, m.text, "text/markdown"); }}>Export .md</button>
            <button className="ghost" onClick={async () => { await flush(); await repo.trash(note.id); onChanged(); }}>Trash</button>
          </>)}
        </div>
      </div>
      {!locked && (
        <label className="ed-folder">
          <span>Folder</span>
          <input list="pip-folders" value={folder} placeholder="None. Use Work/Clients to nest" aria-label="Folder" maxLength={90}
            onChange={e => setFolder(e.target.value)} onBlur={() => void moveTo()} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
          <datalist id="pip-folders">{folders.map(f => <option key={f} value={f} />)}</datalist>
        </label>)}
      {ai && !locked && (
        <div className="ai-bar" aria-label="AI tools">
          <button className="ai-btn" disabled={!!busy} onClick={() => void runAi("meta")}>{busy === "meta" ? "Thinking" : "Title and folder"}</button>
          <button className="ai-btn" disabled={!!busy} onClick={() => void runAi("clean")}>{busy === "clean" ? "Thinking" : "Tidy up"}</button>
          {aiMsg && <span className="ai-msg" role="status">{aiMsg}</span>}
        </div>)}
      {sug && (sug.title || sug.folder) && (
        <div className="ai-sug" role="group" aria-label="Suggestion">
          {sug.title && <button onClick={() => { setTitle(sug.title); touch(); setSug(s => s && { ...s, title: "" }); }}>Title: <b>{sug.title}</b></button>}
          {sug.folder && <button onClick={() => { setFolder(sug.folder); setSug(s => s && { ...s, folder: "" }); void (async () => { await flush(); try { const n = await repo.update(note.id, rev.current, { folder: cleanFolder(sug.folder) }); rev.current = n.revision; onChanged(); } catch { setAiMsg("Couldn't move it."); } })(); }}>Folder: <b>{sug.folder}</b></button>}
          <button className="ghost" onClick={() => setSug(null)}>Dismiss</button>
        </div>)}
      {conflict && (
        <div className="conflict" role="alert">
          <p>This note changed in another window. Your edits are still here.</p>
          <div><button className="primary sm" onClick={reload}>Load latest</button><button className="ghost" onClick={() => void saveAsCopy()}>Save mine as a new note</button></div>
        </div>
      )}
      <input className="ed-title" value={title} disabled={locked} placeholder="Untitled" aria-label="Title" onChange={e => { setTitle(e.target.value); touch(); }} />
      <RichBody ref={richRef} key={seed} html={rich} disabled={locked} onChange={h => { const c = sanitizeRich(h); setRich(c); setBody(richToPlain(c)); touch(); }} />
      <div className="checklist" aria-label="Checklist">
        {items.map(i => (
          <div className="check-row" key={i.id}>
            <input type="checkbox" checked={i.done} disabled={locked} onChange={() => toggle(i.id)} aria-label={`Done: ${i.text || "item"}`} />
            <input type="text" className={i.done ? "done" : ""} value={i.text} disabled={locked} placeholder="Checklist item" onChange={e => edit(i.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Backspace" && !i.text) remove(i.id); }} />
            {!locked && <button className="ghost x" onClick={() => remove(i.id)} aria-label="Remove item">Remove</button>}
          </div>
        ))}
        {!locked && <button className="ghost add" onClick={add}>Add checklist item</button>}
      </div>
    </section>
  );
}

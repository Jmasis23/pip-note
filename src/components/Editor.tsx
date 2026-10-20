import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { LiveTextStepper } from "./LiveTextStepper";
import { ColorPick, type Tone } from "./ColorPick";
import type { ChecklistItem, Note } from "../domain";
import { ConflictError } from "../domain";
import { repo } from "../useNotes";
import { cleanFolder } from "../repo/repo";
import { exportFile } from "../native";
import { plainToRich, richToPlain, sanitizeRich } from "../rich";
import { RichBody } from "./RichBody";
import { Dropdown, NewFolder } from "./Dropdown";
import type { RichHandle } from "./RichBody";
import { aiAvailable, aiComplete } from "../ai/client";
import { cleanRewrite, rewriteMessages } from "../ai/plan";
import "./ai.css";

type Save = "idle" | "pending" | "saved" | "error";
const uid = () => crypto.randomUUID();

export type EditorHandle = { flush: () => Promise<boolean> };
export const Editor = forwardRef<EditorHandle, { note: Note; folders?: string[]; onChanged: () => void; onBack: () => void; color?: Tone | null; onColor?: (c: Tone | null) => void }>(function Editor({ note, folders = [], onChanged, onBack, color = null, onColor }, handle) {
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
  const editVersion = useRef(0);
  const saving = useRef<Promise<boolean> | null>(null);
  const latest = useRef({ title, body, rich, items });
  latest.current = { title, body, rich, items };
  const locked = note.deletedAt !== null;
  const [info, setInfo] = useState("");
  useEffect(() => setInfo(""), [note.id]);
  const richRef = useRef<RichHandle>(null);
  const [folder, setFolder] = useState(note.folder ?? "");
  useEffect(() => setFolder(note.folder ?? ""), [note.id, note.folder]);
  const [menu, setMenu] = useState(false);
  const [instruction, setInstruction] = useState("");
  const rewriteButton = useRef<HTMLButtonElement>(null);
  const rewriteInput = useRef<HTMLTextAreaElement>(null);
  const rewriting = useRef(false);
  const [rw, setRw] = useState<{ s: "busy" } | { s: "done"; prev: { body: string; rich: string; items: ChecklistItem[] } } | { s: "err"; msg: string } | null>(null);
  useEffect(() => { setRw(null); setMenu(false); setInstruction(""); }, [note.id]);
  useEffect(() => { if (menu) rewriteInput.current?.focus(); }, [menu]);
  const closeRewrite = () => { setMenu(false); rewriteButton.current?.focus(); };
  const rewrite = async () => {
    if (!instruction.trim() || rewriting.current) return;
    setMenu(false);
    const src = latest.current.body.trim() || latest.current.items.map(i => i.text).join("\n");
    if (!src) { setRw({ s: "err", msg: "Write something first." }); return; }
    rewriting.current = true;
    const version = editVersion.current;
    const source = JSON.stringify(latest.current);
    setRw({ s: "busy" });
    try {
      const out = cleanRewrite(await aiComplete(rewriteMessages(instruction, src)));
      if (!out) throw new Error("Empty reply.");
      if (editVersion.current !== version || JSON.stringify(latest.current) !== source) throw new Error("Your note changed while rewriting. Your edits are still here. Try again.");
      const prev = { body: latest.current.body, rich: latest.current.rich, items: latest.current.items };
      const r = plainToRich(out); setBody(out); setRich(r); setSeed(x => x + 1);
      touch(); setRw({ s: "done", prev });
    } catch (e) { setRw({ s: "err", msg: String((e as Error)?.message ?? e).slice(0, 140) }); }
    finally { rewriting.current = false; }
  };
  const undoRw = () => { if (rw?.s !== "done") return; const { prev } = rw; setBody(prev.body); setRich(prev.rich); setItems(prev.items); setSeed(x => x + 1); touch(); setRw(null); };
  const moveTo = async (to?: string) => { const f = cleanFolder(to ?? folder); setFolder(f); if (f === (note.folder ?? "")) return; if (!await flush()) return; try { const n = await repo.update(note.id, rev.current, { folder: f }); rev.current = n.revision; onChanged(); } catch { setErr("Couldn't move it."); setSave("error"); } };

  useEffect(() => { setTitle(note.title); setBody(note.body); setRich(note.rich ?? plainToRich(note.body)); setSeed(x => x + 1); setItems(note.checklist); rev.current = note.revision; setSave("idle"); setConflict(null); setErr(""); dirty.current = false; }, [note.id]);
  useEffect(() => {
    if (!dirty.current && !conflict) {
      const nextRich = note.rich ?? plainToRich(note.body);
      // RichBody is intentionally uncontrolled: reseed only for a different saved document.
      if (nextRich !== latest.current.rich) setSeed(x => x + 1);
      setTitle(note.title); setBody(note.body); setRich(nextRich); setItems(note.checklist); rev.current = note.revision;
    }
  }, [note.revision]);

  const flush = (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (saving.current) return saving.current;
    if (!dirty.current || locked) return Promise.resolve(!dirty.current);
    saving.current = (async () => {
      try {
        // Blur, debounce and close can all request a save. Share one writer and drain newer edits.
        do {
          const version = editVersion.current;
          const { title, body, rich, items } = latest.current;
          const n = await repo.update(note.id, rev.current, { title, body, rich, checklist: items });
          rev.current = n.revision; dirty.current = editVersion.current !== version;
          if (!dirty.current) { setSave("saved"); setErr(""); }
          onChanged();
        } while (dirty.current);
        return true;
      } catch (e) {
        if (e instanceof ConflictError) { setConflict(e.latest); setSave("error"); }
        else { setSave("error"); setErr("Couldn't save. Your text is still here."); }
        return false;
      }
    })().finally(() => { saving.current = null; });
    return saving.current;
  };
  const touch = () => { editVersion.current++; dirty.current = true; setSave("pending"); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void flush(), 600); };
  useImperativeHandle(handle, () => ({ flush }));
  useEffect(() => () => { window.clearTimeout(timer.current); if (dirty.current) void flush(); }, [note.id]);

  const toggle = (id: string) => { setItems(a => a.map(i => i.id === id ? { ...i, done: !i.done } : i)); touch(); };
  const edit = (id: string, text: string) => { setItems(a => a.map(i => i.id === id ? { ...i, text } : i)); touch(); };
  const add = () => { setItems(a => [...a, { id: uid(), text: "", done: false }]); touch(); setTimeout(() => document.querySelector<HTMLInputElement>(".check-row:last-of-type input[type=text]")?.focus(), 0); };
  const remove = (id: string) => { setItems(a => a.filter(i => i.id !== id)); touch(); };

  const saveAsCopy = async () => { await repo.create({ title: `${title} (my version)`, body, rich, checklist: items }); setConflict(null); dirty.current = false; onChanged(); };
  const reload = () => { if (!conflict) return; setTitle(conflict.title); setBody(conflict.body); setRich(conflict.rich ?? plainToRich(conflict.body)); setSeed(x => x + 1); setItems(conflict.checklist); rev.current = conflict.revision; dirty.current = false; setConflict(null); setSave("idle"); onChanged(); };

  const label = info ? info : locked ? "In Trash" : save === "pending" ? "Saving" : save === "saved" ? "Saved" : save === "error" ? (err || "Not saved") : "";

  return (
    <section className="editor" onBlur={() => void flush()} aria-label="Note editor">
      <div className="ed-bar">
        <button className="ghost back" onClick={async () => { if (await flush()) onBack(); }} aria-label="Back to notes">Notes</button>
        <span className={`status ${save === "error" ? "bad" : ""}`} role="status" aria-live="polite">{label}</span>
        <div className="ed-actions">
          {locked ? (<>
            <button className="ghost" onClick={async () => { await repo.restore(note.id); onChanged(); }}>Restore</button>
            <button className="ghost danger" onClick={async () => { if (confirm("Delete this note forever? This can't be undone.")) { await repo.deleteForever(note.id); onChanged(); } }}>Delete forever</button>
          </>) : (<>
            {aiAvailable() && <button ref={rewriteButton} className="ghost" aria-expanded={menu} disabled={rw?.s === "busy"} onClick={() => setMenu(m => !m)}>{rw?.s === "busy" ? "Working..." : "Rewrite"}</button>}
            {onColor && <ColorPick value={color} onChange={onColor} />}
            <button className="ghost" aria-pressed={note.pinned} onClick={async () => { if (!await flush()) return; await repo.setPinned(note.id, !note.pinned); onChanged(); }}>{note.pinned ? "Unpin" : "Pin"}</button>
            <button className="ghost" onClick={async () => { if (!await flush()) return; try { const m = await repo.exportMarkdown(note.id); const where = await exportFile(m.filename, m.text, "text/markdown"); if (where) setInfo(`Saved to ${where}`); } catch { setInfo("Couldn't save the file."); } }}>Export .md</button>
            <button className="ghost" onClick={async () => { if (!await flush()) return; await repo.trash(note.id); onChanged(); }}>Trash</button>
          </>)}
        </div>
      </div>
      {menu && !locked && <form className="rw-form" aria-label="Rewrite note" onSubmit={e => { e.preventDefault(); void rewrite(); }} onKeyDown={e => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRewrite(); }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); void rewrite(); }
      }}>
        <label>What would you like to change?
          <textarea ref={rewriteInput} aria-label="Rewrite instruction" value={instruction} maxLength={2000} rows={3} placeholder="Make it shorter, translate it, or turn it into an email…" onChange={e => setInstruction(e.target.value)} />
        </label>
        <div className="rw-form-actions"><button type="button" className="ghost" onClick={closeRewrite}>Cancel</button><button type="submit" className="primary sm" disabled={!instruction.trim()}>Rewrite note</button></div>
      </form>}
      {!locked && (
        <div className="ed-folder">
          <span>Folder</span>
          <Dropdown label="Folder" value={folder} placeholder="None" options={[{ value: "", label: "None" }, ...folders.map(f => ({ value: f, label: f }))]}
            onChange={v => { setFolder(v); void moveTo(v); }}
            footer={close => <NewFolder onAdd={f => { const c = cleanFolder(f); if (c) { setFolder(c); void moveTo(c); } close(); }} />} />
                    <LiveTextStepper className="ed-ts" />
        </div>)}
      {rw && rw.s !== "busy" && <div className="rw-bar" role="status">{rw.s === "done" ? <><span>Rewritten.</span><button className="ok" onClick={() => setRw(null)}>Keep</button><button className="no" onClick={undoRw}>Undo</button></> : <><span>{rw.msg}</span><button className="no" onClick={() => setRw(null)}>Close</button></>}</div>}
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
});

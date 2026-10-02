import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Pin, Trash2, RotateCcw, X, Download } from "lucide-react";
import type { Note, NoteFilter } from "./types";
import { bridge } from "./lib/bridge";
import { CaptureModal } from "./components/CaptureModal";
import { PipMascot } from "./components/PipMascot";

const filters:{id:NoteFilter;label:string}[]=[
  {id:"all",label:"All notes"},{id:"today",label:"Today"},{id:"pinned",label:"Pinned"},{id:"trash",label:"Trash"}
];

export default function App(){
  const [filter,setFilter]=useState<NoteFilter>("all");
  const [query,setQuery]=useState("");
  const [notes,setNotes]=useState<Note[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [capture,setCapture]=useState(false);
  const selected=useMemo(()=>notes.find(n=>n.id===selectedId)||notes[0]||null,[notes,selectedId]);

  async function load(){
    const rows=await bridge.listNotes(filter,query);
    setNotes(rows);
    if(rows.length && !rows.some(n=>n.id===selectedId)) setSelectedId(rows[0].id);
  }
  useEffect(()=>{load();},[filter,query]);

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{if(e.ctrlKey&&e.shiftKey&&e.code==="Space"){e.preventDefault();setCapture(true);}};
    window.addEventListener("keydown",h); return()=>window.removeEventListener("keydown",h);
  },[]);

  async function patch(n:Note){
    const saved=await bridge.updateNote(n);
    setNotes(curr=>curr.map(x=>x.id===saved.id?saved:x));
  }

  async function exportAll(){
    const json=await bridge.exportJson();
    const blob=new Blob([json],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url;a.download="pip-notes.json";a.click();URL.revokeObjectURL(url);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><PipMascot size={34}/><div><strong>Pip</strong><span>Thought it? Keep it.</span></div></div>
      <button className="new-note" onClick={()=>setCapture(true)}><Plus size={17}/> New note</button>
      <nav>{filters.map(f=><button key={f.id} onClick={()=>setFilter(f.id)} className={filter===f.id?"active":""}>{f.label}</button>)}</nav>
      <button className="export" onClick={exportAll}><Download size={16}/> Export JSON</button>
    </aside>

    <main className="library">
      <header className="toolbar"><div className="searchbox"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search notes"/></div></header>
      <section className="content-grid">
        <div className="note-list">
          {notes.length===0?<div className="empty">No notes here yet.</div>:notes.map(n=><button key={n.id} className={selected?.id===n.id?"note-row selected":"note-row"} onClick={()=>setSelectedId(n.id)}>
            <div><strong>{n.title||"Untitled"}</strong>{n.pinned&&<Pin size={13} fill="currentColor"/>}</div>
            <p>{n.body||"Empty note"}</p><span>{new Date(n.updatedAt).toLocaleString()}</span>
          </button>)}
        </div>

        <div className="editor-wrap">
          {selected ? <article className="editor">
            <div className="editor-actions">
              {!selected.deletedAt && <button title="Pin" onClick={async()=>{await bridge.togglePin(selected);load();}}><Pin size={17}/></button>}
              {!selected.deletedAt && <button title="Trash" onClick={async()=>{await bridge.trashNote(selected);load();}}><Trash2 size={17}/></button>}
              {selected.deletedAt && <button title="Restore" onClick={async()=>{await bridge.restoreNote(selected);load();}}><RotateCcw size={17}/></button>}
              {selected.deletedAt && <button title="Delete forever" onClick={async()=>{if(confirm("Delete this note forever?")){await bridge.deleteForever(selected.id);load();}}}><X size={17}/></button>}
            </div>
            <input className="editor-title" value={selected.title} onChange={e=>setNotes(curr=>curr.map(n=>n.id===selected.id?{...n,title:e.target.value}:n))} onBlur={()=>patch(selected)}/>
            <textarea className="editor-body" value={selected.body} onChange={e=>setNotes(curr=>curr.map(n=>n.id===selected.id?{...n,body:e.target.value}:n))} onBlur={()=>patch(selected)}/>
            <footer>Revision {selected.revision}</footer>
          </article>:<div className="editor-empty"><PipMascot size={54}/><h2>Capture what matters.</h2><p>Use Ctrl + Shift + Space from anywhere.</p></div>}
        </div>
      </section>
    </main>
    <CaptureModal open={capture} onClose={()=>setCapture(false)} onSaved={load}/>
  </div>
}
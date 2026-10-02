import { useEffect, useRef, useState } from "react";
import { bridge } from "../lib/bridge";
import { PipMascot } from "./PipMascot";

export function CaptureModal({open,onClose,onSaved}:{open:boolean;onClose:()=>void;onSaved:()=>void}){
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [status,setStatus]=useState<"idle"|"saving"|"saved"|"error">("idle");
  const bodyRef=useRef<HTMLTextAreaElement>(null);

  useEffect(()=>{
    if(!open) return;
    bridge.loadDraft().then(d=>{ if(d){setTitle(d.title);setBody(d.body);} setTimeout(()=>bodyRef.current?.focus(),0); });
  },[open]);

  async function keep(){
    if(!title.trim() && !body.trim()) return;
    setStatus("saving");
    try{
      await bridge.createNote(title.trim() || body.trim().split("\n")[0].slice(0,60), body);
      await bridge.clearDraft();
      setTitle("");setBody("");setStatus("saved");onSaved();
      setTimeout(()=>{setStatus("idle");onClose();},500);
    }catch{ setStatus("error"); }
  }

  async function dismiss(){
    if(title.trim()||body.trim()) await bridge.saveDraft(title,body);
    onClose();
  }

  if(!open) return null;
  return <div className="capture-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)dismiss();}}>
    <section className="capture-panel" aria-modal="true" role="dialog" aria-label="Quick capture" onKeyDown={e=>{
      if(e.key==="Escape") dismiss();
      if(e.key==="Enter" && e.ctrlKey) keep();
    }}>
      <div className="capture-head"><PipMascot state={status==="idle"?"capturing":status}/><div><b>Something on your mind?</b><span>Thought it? Keep it.</span></div></div>
      <input className="capture-title" placeholder="Title (optional)" value={title} onChange={e=>setTitle(e.target.value)}/>
      <textarea ref={bodyRef} className="capture-body" placeholder="Type it before it disappears…" value={body} onChange={e=>setBody(e.target.value)}/>
      <div className="capture-footer">
        <span className={status==="error"?"status error":"status"}>{status==="error"?"Couldn't save. Your text is still here.":status==="saving"?"Saving…":status==="saved"?"Got it. Saved.":"Ctrl + Enter to save"}</span>
        <button className="primary" onClick={keep}>Keep it</button>
      </div>
    </section>
  </div>
}
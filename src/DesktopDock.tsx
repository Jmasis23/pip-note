import {useEffect, useRef, useState} from "react";
import {MotionConfig} from "motion/react";
import {FolderRail, Floating} from "./components/FolderRail";
import {Editor} from "./components/Editor";
import {repo, useNotes} from "./useNotes";
import {call, isNative, syncDesktopPrefs} from "./native";
import {cleanFolder} from "./repo/repo";
import {useFull} from "./dirs/util";
import type {Note} from "./domain";
import "@fontsource-variable/inter";
import "@fontsource-variable/bricolage-grotesque";
import "./bui/pip.css";
import "./dirs/b.css";
import "./desktop-dock.css";

/** A host for the real rail and editor. Native window regions leave the desktop clickable. */
export default function DesktopDock({floatingId=null}: {floatingId?: string|null}) {
  const {allNotes,folders,prefs,setPrefs,refresh}=useNotes();
  const [visible,setVisible]=useState(!isNative());
  const [listening,setListening]=useState(!isNative());
  const [redock,setRedock]=useState<{id:string;sequence:number}|null>(null);
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    document.documentElement.classList.add("desktop-win");
    if (floatingId) document.documentElement.classList.add("floating-win");
    return ()=>{document.documentElement.classList.remove("desktop-win","floating-win");};
  },[floatingId]);
  useEffect(()=>{
    const mq=matchMedia("(prefers-color-scheme: dark)");
    const apply=()=>{const d=document.documentElement.dataset;
      d.theme=prefs.theme==="dark" || (prefs.theme==="system" && mq.matches)?"dark":"light";
      d.motion=prefs.reducedMotion?"reduced":"full";d.accent=prefs.accent;d.text=prefs.textSize;d.tint=prefs.tint;
    }; apply();mq.addEventListener("change",apply);return ()=>mq.removeEventListener("change",apply);
  },[prefs]);
  // The companion stays loaded in tray mode, so native preferences do not depend on the dashboard.
  useEffect(()=>{if(!floatingId)syncDesktopPrefs(prefs.shakeToCapture,prefs.shortcut,prefs.shakeSens);},[floatingId,prefs.shakeToCapture,prefs.shortcut,prefs.shakeSens]);
  useEffect(()=>{
    if(!isNative() || floatingId)return;
    let dead=false;const offs:(()=>void)[]=[];
    void import("@tauri-apps/api/event").then(async({listen})=>{
      for(const off of await Promise.all([
        listen<boolean>("pip://dock-visible",e=>setVisible(e.payload)),
        listen<string>("pip://redock",e=>{setVisible(true);setRedock(old=>({id:e.payload,sequence:(old?.sequence??0)+1}));}),
      ])){if(dead)off();else offs.push(off);}
      if(!dead)setListening(true);
    });
    return ()=>{dead=true;offs.forEach(f=>f());};
  },[floatingId]);
  useEffect(()=>{
    if(!isNative() || floatingId || !listening)return;
    let frame=0,last="",pending=false,dead=false;
    const report=()=>{
      if(dead)return;
      const surfaces=[...document.querySelectorAll<HTMLElement>(".fr,.fr-panel,.fr-float,[role=tooltip],[role=listbox],.dropdown-menu,.rw-menu")]
        .filter(el=>getComputedStyle(el).visibility!=="hidden" && el.getClientRects().length>0)
        .map(el=>{const r=el.getBoundingClientRect();return {x:Math.max(0,r.x-10),y:Math.max(0,r.y-10),width:r.width+20,height:r.height+20};});
      const next=JSON.stringify({surfaces,scale:window.devicePixelRatio});
      if(next!==last && !pending){pending=true;void call("desktop_regions",{surfaces}).then(()=>{last=next;}).catch(console.error).finally(()=>{pending=false;schedule();});}
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(report);};
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{attributes:true,childList:true,subtree:true});
    const resize=new ResizeObserver(schedule);resize.observe(document.body);
    window.addEventListener("resize",schedule);schedule();
    return ()=>{dead=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();window.removeEventListener("resize",schedule);};
  },[floatingId,listening]);
  const color=(id:string,c:Parameters<typeof Editor>[0]["color"])=>{
    const colors={...(prefs.noteColors??{})};if(c)colors[id]=c;else delete colors[id];void setPrefs({...prefs,noteColors:colors});
  };
  const editor=(id:string,back:()=>void)=><DockEditor id={id} notes={allNotes} folders={folders} color={prefs.noteColors?.[id]??null} onColor={c=>color(id,c)} onChanged={()=>void refresh()} onBack={back}/>;
  return <MotionConfig reducedMotion={prefs.reducedMotion?"always":"user"}><div ref={root} className="db desktop-host">
    {floatingId ? <Floating native f={{id:floatingId,x:12,y:12}} z={0} onFront={()=>{}} onClose={()=>void call("win_close")} onDock={()=>void call("desktop_redock",{id:floatingId})}>
      {editor(floatingId,()=>void call("win_close"))}
    </Floating> : <FolderRail desktopVisible={visible} redockId={redock?.id} redockSequence={redock?.sequence} notes={allNotes} folders={folders} pinned={prefs.pinnedFolders??[]}
      onTogglePin={f=>void setPrefs({...prefs,pinnedFolders:(prefs.pinnedFolders??[]).includes(f)?(prefs.pinnedFolders??[]).filter(x=>x!==f):[...(prefs.pinnedFolders??[]),f]})}
      onAddFolder={async name=>{const f=cleanFolder(name);if(!f)return null;const current=await repo.getPrefs();await setPrefs({...current,extraFolders:[...new Set([...current.extraFolders,f])]});return f;}}
      renderEditor={editor}/>}
  </div></MotionConfig>;
}
function DockEditor({id,notes,...props}:{id:string;notes:Note[]}&Omit<Parameters<typeof Editor>[0],"note">){
  const note=useFull(id,notes);return note?<Editor key={note.id} note={note} {...props}/>:null;
}


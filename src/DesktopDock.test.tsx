// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,expect,it,vi} from "vitest";
import {FolderRail} from "./components/FolderRail";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
vi.stubGlobal("matchMedia",()=>({matches:true,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}));
let stop=()=>{};
afterEach(()=>{stop();document.body.innerHTML="";});
it("retracts the desktop rail while preserving a pinned folder panel",async()=>{
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);stop=()=>act(()=>root.unmount());
 const render=(visible:boolean)=>root.render(<FolderRail notes={[]} folders={["Work"]} pinned={["Work"]} onTogglePin={()=>{}} onAddFolder={async()=>null} renderEditor={()=>null} desktopVisible={visible}/>);
 await act(async()=>render(true));
 await act(async()=>{(el.querySelector('[aria-label="Work, 0 notes"]') as HTMLButtonElement).click();});
 await act(async()=>render(false));
 expect(el.querySelector("nav")?.getAttribute("aria-hidden")).toBe("true");
 expect(el.querySelector('[aria-label="Work"]')).not.toBeNull();
});

it("keeps an unpinned editor mounted while retracting its panel",async()=>{
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);stop=()=>act(()=>root.unmount());
 const note={id:"note",title:"Draft",body:"",checklist:[],createdAt:1,updatedAt:1,pinned:false,folder:"Work",deletedAt:null,revision:1};
 const render=(visible:boolean)=>root.render(<FolderRail notes={[note]} folders={["Work"]} pinned={[]} onTogglePin={()=>{}} onAddFolder={async()=>null} renderEditor={()=> <textarea defaultValue="unsaved recovery text"/>} desktopVisible={visible}/>);
 await act(async()=>render(true));
 await act(async()=>{(el.querySelector('[aria-label="Work, 1 notes"]') as HTMLButtonElement).click();});
 await act(async()=>{(el.querySelector(".fr-open") as HTMLButtonElement).click();});
 await act(async()=>{await new Promise(r=>setTimeout(r,300));});
 const editor=el.querySelector("textarea");expect(editor).not.toBeNull();
 await act(async()=>render(false));
 expect(el.querySelector("textarea")).toBe(editor);
 expect((el.querySelector(".fr-panel") as HTMLElement).style.visibility).toBe("hidden");
 await act(async()=>render(true));expect(el.querySelector("textarea")?.value).toBe("unsaved recovery text");
});
it("handles repeated redock requests for the same note",async()=>{
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);stop=()=>act(()=>root.unmount());
 const note={id:"note",title:"Draft",body:"",checklist:[],createdAt:1,updatedAt:1,pinned:false,folder:"Work",deletedAt:null,revision:1};
 const render=(sequence:number)=>root.render(<FolderRail notes={[note]} folders={["Work"]} pinned={[]} onTogglePin={()=>{}} onAddFolder={async()=>null} renderEditor={()=> <textarea defaultValue="redocked"/>} desktopVisible redockId="note" redockSequence={sequence}/>);
 await act(async()=>render(1));expect(el.querySelector("textarea")).not.toBeNull();
 await act(async()=>{(el.querySelector('[aria-label="Close folder"]') as HTMLButtonElement).click();await new Promise(r=>setTimeout(r,300));});
 await act(async()=>render(2));await act(async()=>{await new Promise(r=>setTimeout(r,300));});
 expect(el.querySelector("textarea")?.value).toBe("redocked");
});

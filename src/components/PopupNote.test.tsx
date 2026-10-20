// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {Simulate} from "react-dom/test-utils";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {createRepo,type NoteRepo} from "../repo/repo";
import {PopupNote} from "./PopupNote";
const state=vi.hoisted(()=>({repo:null as unknown as NoteRepo}));
vi.mock("../useNotes",()=>({repo:new Proxy({}, {get:(_,key)=>state.repo[key as keyof NoteRepo]})}));
vi.mock("../ai/client",()=>({aiAvailable:()=>false}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();Object.defineProperty(document,"queryCommandState",{value:()=>false,configurable:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());vi.useRealTimers();host.remove();});
const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
it("waits for the last keystroke to persist before closing a quick note",async()=>{
 const data=new Map<string,string>();const repo=createRepo({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}});
 let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 state.repo={...repo,update:async(...args)=>{await gate;return repo.update(...args);}};
 const closed: boolean[]=[];
 await act(async()=>{root.render(<PopupNote onClose={kept=>closed.push(kept)}/>);await settle();});
 const title=host.querySelector<HTMLInputElement>('[aria-label="Title"]')!;
 await act(async()=>{title.value="Do not lose this";Simulate.change(title);});
 await act(async()=>{host.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();vi.advanceTimersByTime(125);await settle();});
 expect(closed).toEqual([]);
 await act(async()=>{release();await settle();});
 expect(closed).toEqual([true]);
 expect((await repo.list({view:"all",query:""})).map(n=>n.title)).toEqual(["Do not lose this"]);
});
it.each(["Escape","Ctrl+Enter"])("persists once when %s and another dismissal arrive together",async key=>{
 const data=new Map<string,string>();const repo=createRepo({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}});
 let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 state.repo={...repo,update:async(...args)=>{await gate;return repo.update(...args);}};
 const closed:boolean[]=[];
 await act(async()=>{root.render(<PopupNote onClose={kept=>closed.push(kept)}/>);await settle();});
 const title=host.querySelector<HTMLInputElement>('[aria-label="Title"]')!;
 await act(async()=>{title.value="Keyboard capture";Simulate.change(title);});
 await act(async()=>{
  Simulate.keyDown(title,{key:key==="Escape"?"Escape":"Enter",ctrlKey:key==="Ctrl+Enter"});
  window.dispatchEvent(new Event("pip-dismiss"));await settle();
 });
 expect(closed).toEqual([]);
 await act(async()=>{release();await settle();});
 const notes=await repo.list({view:"all",query:""});
 expect(closed).toEqual([true]);expect(notes[0].title).toBe("Keyboard capture");expect(notes[0].revision).toBe(2);
});
it("keeps failed capture edits visible and lets the user retry closing",async()=>{
 const data=new Map<string,string>();const repo=createRepo({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}});
 let fail=true;state.repo={...repo,update:async(...args)=>{if(fail)throw new Error("disk full");return repo.update(...args);}};
 const closed:boolean[]=[];
 await act(async()=>{root.render(<PopupNote onClose={kept=>closed.push(kept)}/>);await settle();});
 const title=host.querySelector<HTMLInputElement>('[aria-label="Title"]')!;
 await act(async()=>{title.value="Recover me";Simulate.change(title);});
 await act(async()=>{host.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();await settle();});
 expect(closed).toEqual([]);expect(title.value).toBe("Recover me");
 expect(host.querySelector('[role="status"]')?.textContent).toBe("Couldn't save. Your text is still here.");
 fail=false;await act(async()=>{host.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();await settle();});
 expect(closed).toEqual([true]);expect((await repo.list({view:"all",query:""}))[0].title).toBe("Recover me");
});
it("removes an untouched empty capture when dismissed",async()=>{
 const data=new Map<string,string>();const repo=createRepo({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}});state.repo=repo;
 const closed:boolean[]=[];
 await act(async()=>{root.render(<PopupNote onClose={kept=>closed.push(kept)}/>);await settle();});
 await act(async()=>{host.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();await settle();});
 expect(closed).toEqual([false]);expect(await repo.list({view:"all",query:""})).toEqual([]);expect(await repo.list({view:"trash",query:""})).toEqual([]);
});
it("keeps capture open when verifying saved content fails and allows a retry",async()=>{
 const data=new Map<string,string>();const repo=createRepo({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}});
 let failRead=false;state.repo={...repo,get:async id=>{if(failRead)throw new Error("read failed");return repo.get(id);}};
 const closed:boolean[]=[];
 await act(async()=>{root.render(<PopupNote onClose={kept=>closed.push(kept)}/>);await settle();});
 failRead=true;
 await act(async()=>{host.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();await settle();});
 expect(closed).toEqual([]);expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't close");
 failRead=false;
 await act(async()=>{host.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();await settle();});
 expect(closed).toEqual([false]);
});

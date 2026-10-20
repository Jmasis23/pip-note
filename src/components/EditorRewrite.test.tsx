// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {Simulate} from "react-dom/test-utils";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {createRepo,type NoteRepo} from "../repo/repo";
import type {Note} from "../domain";
import {Editor} from "./Editor";
const bridge=vi.hoisted(()=>({update:vi.fn(),getPrefs:vi.fn(),complete:vi.fn()}));
vi.mock("../useNotes",()=>({repo:bridge}));
vi.mock("../ai/client",()=>({aiAvailable:()=>true,aiComplete:bridge.complete}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();host=document.createElement("div");document.body.append(host);root=createRoot(host);bridge.complete.mockReset();});
afterEach(()=>{act(()=>root.unmount());vi.useRealTimers();vi.restoreAllMocks();host.remove();});
const settle=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
async function open(onReady?:(note:Note,repo:NoteRepo)=>void){
 const data=new Map<string,string>(),repo=createRepo({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}});
 bridge.update.mockImplementation(repo.update);bridge.getPrefs.mockImplementation(repo.getPrefs);
 const note=await repo.create({title:"Note",body:"Original body"});
 onReady?.(note,repo);
 await act(async()=>root.render(<Editor note={note} onChanged={()=>{}} onBack={()=>{}}/>));
 await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="Rewrite")!.click());
 return host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Rewrite instruction"]');
}
it("opens an inline instruction form and supports custom requests with undo",async()=>{
 const input=await open();expect(input).not.toBeNull();expect(document.activeElement).toBe(input);
 expect(host.querySelector('[role="menu"]')).toBeNull();
 expect(input!.closest("form")?.parentElement?.classList.contains("editor")).toBe(true);
 const form=input!.closest("form")!;expect(form.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(true);
 await act(async()=>{input!.value="Make this a warm email in Spanish";Simulate.change(input!);});
 bridge.complete.mockResolvedValue("Hola, ¿cómo estás?");
 await act(async()=>{Simulate.submit(form);await settle();});
 expect(bridge.complete.mock.calls[0][0][1].content).toContain("Make this a warm email in Spanish");
 expect(host.querySelector('[aria-label="Body"]')?.textContent).toBe("Hola, ¿cómo estás?");
 await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="Undo")!.click());
 expect(host.querySelector('[aria-label="Body"]')?.textContent).toBe("Original body");
});
it("Escape closes only the instruction box and restores Rewrite focus",async()=>{
 const input=await open();expect(input).not.toBeNull();
 await act(async()=>Simulate.keyDown(input!,{key:"Escape"}));
 expect(host.querySelector("textarea")).toBeNull();
 expect(document.activeElement?.textContent).toBe("Rewrite");
 expect(bridge.complete).not.toHaveBeenCalled();
});
it("does not replace typing added while a rewrite is pending",async()=>{
 const input=await open();expect(input).not.toBeNull();
 await act(async()=>{input!.value="Make this shorter";Simulate.change(input!);});
 let finish=(s:string)=>{};bridge.complete.mockImplementation(()=>new Promise<string>(resolve=>{finish=resolve;}));
 await act(async()=>Simulate.submit(input!.closest("form")!));
 const title=host.querySelector<HTMLInputElement>('[aria-label="Title"]')!;
 await act(async()=>{title.value="New typing";Simulate.change(title);});
 await act(async()=>{finish("Rewritten body");await settle();});
 expect(host.querySelector('[aria-label="Body"]')?.textContent).toBe("Original body");
 expect(title.value).toBe("New typing");
 expect(host.textContent).toContain("changed while");
});
it("does not overwrite another window's update with a stale rewrite result",async()=>{
 let original!:Note,repo!:NoteRepo;
 const input=await open((note,store)=>{original=note;repo=store;});
 await act(async()=>{input!.value="Make this shorter";Simulate.change(input!);});
 let finish=(s:string)=>{};bridge.complete.mockImplementation(()=>new Promise<string>(resolve=>{finish=resolve;}));
 await act(async()=>Simulate.submit(input!.closest("form")!));
 const updated=await repo.update(original.id,original.revision,{body:"A newer edit from the dashboard",rich:"<div>A newer edit from the dashboard</div>"});
 await act(async()=>root.render(<Editor note={updated} onChanged={()=>{}} onBack={()=>{}}/>));
 await act(async()=>{finish("Stale AI result");await settle();vi.advanceTimersByTime(600);await settle();});
 expect(host.querySelector('[aria-label="Body"]')?.textContent).toBe("A newer edit from the dashboard");
 expect((await repo.get(original.id)).body).toBe("A newer edit from the dashboard");
 expect(host.textContent).toContain("changed while");
});

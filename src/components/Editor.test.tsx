// @vitest-environment jsdom
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {Simulate} from "react-dom/test-utils";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {createRepo} from "../repo/repo";
import {Editor} from "./Editor";

const bridge=vi.hoisted(()=>({update:vi.fn(),getPrefs:vi.fn(),exportMarkdown:vi.fn(),exported:""}));
vi.mock("../useNotes",()=>({repo:bridge}));
vi.mock("../ai/client",()=>({aiAvailable:()=>false}));
vi.mock("../native",()=>({exportFile:async(_name:string,text:string)=>{bridge.exported=text;return "Downloads/note.md";}}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();bridge.exported="";host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());vi.useRealTimers();vi.restoreAllMocks();host.remove();});
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function repository(){const data=new Map<string,string>();const repo=createRepo({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}});bridge.getPrefs.mockImplementation(repo.getPrefs);return repo;}
it("saves typing that arrives while an earlier autosave is pending",async()=>{
 const repo=repository(),note=await repo.create({title:"Original",body:"Body"});
 let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let writes=0;
 bridge.update.mockImplementation(async(...args:Parameters<typeof repo.update>)=>{if(++writes===1)await gate;return repo.update(...args);});
 await act(async()=>root.render(<Editor note={note} onChanged={()=>{}} onBack={()=>{}}/>));
 const title=host.querySelector<HTMLInputElement>('[aria-label="Title"]')!;
 await act(async()=>{title.value="First edit";Simulate.change(title);});
 await act(async()=>{vi.advanceTimersByTime(600);await settle();});
 await act(async()=>{title.value="Latest edit";Simulate.change(title);});
 await act(async()=>{release();await settle();vi.advanceTimersByTime(600);await settle();});
 expect((await repo.get(note.id)).title).toBe("Latest edit");
 expect(host.querySelector('[role="status"]')?.textContent).toBe("Saved");
});
it("refreshes visible rich text after another window updates a clean note",async()=>{
 const repo=repository(),note=await repo.create({title:"Original",body:"Old body"});
 await act(async()=>root.render(<Editor note={note} onChanged={()=>{}} onBack={()=>{}}/>));
 const updated=await repo.update(note.id,note.revision,{body:"Updated elsewhere",rich:"<div>Updated elsewhere</div>"});
 await act(async()=>root.render(<Editor note={updated} onChanged={()=>{}} onBack={()=>{}}/>));
 expect(host.querySelector('[aria-label="Body"]')?.textContent).toBe("Updated elsewhere");
});
it("exports the latest edits after a slow save finishes",async()=>{
 const repo=repository(),note=await repo.create({title:"Original",body:"Body"});
 let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 bridge.update.mockImplementation(async(...args:Parameters<typeof repo.update>)=>{await gate;return repo.update(...args);});
 bridge.exportMarkdown.mockImplementation(repo.exportMarkdown);
 await act(async()=>root.render(<Editor note={note} onChanged={()=>{}} onBack={()=>{}}/>));
 const title=host.querySelector<HTMLInputElement>('[aria-label="Title"]')!;
 await act(async()=>{title.value="Export latest title";Simulate.change(title);});
 await act(async()=>{[...host.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Export .md")!.click();await settle();});
 expect(bridge.exported).toBe("");
 await act(async()=>{release();await settle();});
 expect(bridge.exported).toContain("Export latest title");
});

import { describe, expect, it } from "vitest";
import { createDesktopRepo, type StoreBackend } from "./desktopRepo";
import { ConflictError } from "./domain";

function sharedBackend() {
  let values: Record<string,string> = {};
  const backend: StoreBackend = {
    load: async () => ({...values}),
    commit: async (expected, changes) => {
      if (Object.keys(changes).some(k => (values[k] ?? null) !== (expected[k] ?? null))) return false;
      values={...values,...changes}; return true;
    },
  };
  return backend;
}
describe("desktop repository", () => {
  it("preserves simultaneous creates in independent windows", async () => {
    const backend=sharedBackend(); const a=createDesktopRepo(backend), b=createDesktopRepo(backend);
    await Promise.all([a.create({body:"from dashboard"}),b.create({body:"from dock"})]);
    expect((await a.list({view:"all",query:""})).map(n=>n.body).sort()).toEqual(["from dashboard","from dock"]);
  });
  it("rejects a stale editor revision after another window saved", async () => {
    const backend=sharedBackend(); const a=createDesktopRepo(backend), b=createDesktopRepo(backend);
    const note=await a.create({body:"first"}); await b.update(note.id,1,{body:"second"});
    await expect(a.update(note.id,1,{body:"stale"})).rejects.toBeInstanceOf(ConflictError);
    expect((await a.get(note.id)).body).toBe("second");
  });
  it("does not acknowledge a failed durable commit and can retry later", async () => {
    const backend=sharedBackend(); let fail=true;
    const repo=createDesktopRepo({...backend,commit:async(e,c)=>{if(fail)throw new Error("disk full");return backend.commit(e,c);}});
    await expect(repo.create({body:"keep me"})).rejects.toThrow("disk full");
    fail=false; await repo.create({body:"retry"}); expect((await repo.list({view:"all",query:""})).map(n=>n.body)).toEqual(["retry"]);
  });
  it("merges independent preference changes, pins, and per-note colors across windows",async()=>{
    const backend=sharedBackend();const a=createDesktopRepo(backend),b=createDesktopRepo(backend);
    const [pa,pb]=await Promise.all([a.getPrefs(),b.getPrefs()]);
    await Promise.all([
      a.setPrefs({...pa,theme:"dark",pinnedFolders:["Work"],noteColors:{a:"yellow"}}),
      b.setPrefs({...pb,textSize:"l",pinnedFolders:["Home"],noteColors:{b:"blue"}}),
    ]);
    const p=await a.getPrefs();expect(p.theme).toBe("dark");expect(p.textSize).toBe("l");
    expect(p.pinnedFolders?.sort()).toEqual(["Home","Work"]);expect(p.noteColors).toEqual({a:"yellow",b:"blue"});
  });

});

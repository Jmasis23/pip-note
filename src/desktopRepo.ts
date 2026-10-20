import { DEFAULT_PREFS, type Prefs } from "./domain";
import { createRepo, type NoteRepo } from "./repo/repo";
export interface StoreBackend {
  load(): Promise<Record<string,string>>;
  commit(expected: Record<string,string>, changes: Record<string,string>): Promise<boolean>;
}
/** Serialize this webview's operations; CAS/reload protects against other webviews.
 * Re-run a repository operation only after a competing commit (never after an I/O failure).
 * Expected note revisions remain unchanged on retry, preserving Editor's conflict UI.
 */
export function createDesktopRepo(backend: StoreBackend): NoteRepo {
  let queue: Promise<unknown> = Promise.resolve();
  let observedPrefs: Prefs | undefined;
  const execute = async (method: keyof NoteRepo, args: unknown[], baseline?: Prefs) => {
    for (let attempt=0; attempt<5; attempt++) {
      const expected=await backend.load(); const snapshot={...expected}; const changes: Record<string,string>={};
      const repo=createRepo({getItem:k=>snapshot[k] ?? null,setItem:(k,v)=>{snapshot[k]=v;changes[k]=v;}});
      const fn=repo[method] as (...a: unknown[])=>Promise<unknown>;
      const actual=method === "setPrefs" ? [mergePrefs(baseline ?? DEFAULT_PREFS,args[0] as Prefs,await repo.getPrefs())] : args;
      const result=await fn(...actual);
      if (!Object.keys(changes).length || await backend.commit(expected,changes)) {
        if(method === "getPrefs" || method === "setPrefs") observedPrefs=structuredClone(result as Prefs);
        return result;
      }
    }
    throw new Error("Notes are changing in another window. Please try again.");
  };
  return new Proxy({} as NoteRepo, {get:(_,method: keyof NoteRepo)=>(...args: unknown[])=>{
    const baseline=observedPrefs;
    const pending=queue.then(()=>execute(method,args,baseline));
    queue=pending.catch(()=>{}); return pending;
  }});
}

/** Preserve other windows' fields, set additions/removals, and per-note preferences. */
function mergePrefs(base: Prefs, next: Prefs, current: Prefs): Prefs {
  const result={...current} as unknown as Record<string,unknown>;
  const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  for(const key of Object.keys(next) as (keyof Prefs)[]) {
    if(same(next[key],base[key]))continue;
    if(key==="pinnedFolders" || key==="extraFolders") {
      const before=base[key]??[], requested=next[key]??[];
      const removed=new Set(before.filter(x=>!requested.includes(x)));
      result[key]=[...new Set([...(current[key]??[]).filter(x=>!removed.has(x)),...requested.filter(x=>!before.includes(x))])];
    } else if(key==="noteColors" || key==="cardPositions") {
      const before=base[key]??{}, requested=next[key]??{};
      const merged:Record<string,unknown>={...current[key]};
      for(const id of new Set([...Object.keys(before),...Object.keys(requested)])) {
        const oldValue=(before as Record<string,unknown>)[id],newValue=(requested as Record<string,unknown>)[id];
        if(same(oldValue,newValue))continue;
        if(newValue===undefined)delete merged[id];else merged[id]=newValue;
      }
      result[key]=merged;
    } else result[key]=next[key];
  }
  return result as unknown as Prefs;
}

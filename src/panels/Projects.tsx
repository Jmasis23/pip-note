import { Panel } from "./Panel";
import type { Note } from "../domain";
import "./panels.css";
/** Projects are the folders you already have. Open one to see its notes in the Library. */
export function Projects({ notes, folders, onOpen, onNew, onClose }: { notes: Note[]; folders: string[]; onOpen: (folder: string) => void; onNew: () => void; onClose: () => void }) {
  const live = notes.filter(n => n.deletedAt === null);
  const rows = [...new Set(folders)].sort().map(f => ({ f, n: live.filter(x => (x.folder ?? "") === f || (x.folder ?? "").startsWith(f + "/")).length }));
  return <Panel title="Projects" sub="Folders that group what you kept." onClose={onClose}>
    <div className="pn-row"><span className="pn-msg">{rows.length} project{rows.length === 1 ? "" : "s"}</span><button className="ghost field" onClick={onNew}>New project</button></div>
    <ul className="pn-list">{rows.map(r => <li key={r.f}><div><b>{r.f}</b><p>{r.n} item{r.n === 1 ? "" : "s"}</p></div><div className="pn-act"><button className="ghost field" onClick={() => onOpen(r.f)}>Open</button></div></li>)}</ul>
    {rows.length === 0 && <p className="pn-empty">No projects yet. Make one to group related notes.</p>}
  </Panel>;
}

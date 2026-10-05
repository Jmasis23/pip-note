import { useEffect, useState } from "react";
import { initStorage, isNative } from "./native";
import { repo } from "./useNotes";
import type { Note } from "./domain";
import "@fontsource-variable/inter";
import "./dirs/b.css";
import "./panels/panels.css";

/** One floating reference: a read-only note that stays above other windows. Drag the top bar to move it. */
export default function ReferenceWindow() {
  const [note, setNote] = useState<Note | null>(null); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  useEffect(() => {
    document.documentElement.classList.add("cap-win");
    const id = new URLSearchParams(location.search).get("ref") ?? "";
    void (async () => { try { await initStorage(); } catch { /* use what is loaded */ } try { setNote(await repo.get(id)); } catch { setErr("This note is no longer here."); } })();
  }, []);
  const close = async () => { if (isNative()) { const { getCurrentWindow } = await import("@tauri-apps/api/window"); await getCurrentWindow().close(); } };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") void close(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const copy = async () => { try { await navigator.clipboard.writeText(note?.body ?? ""); setMsg("Copied."); } catch { setMsg("Couldn't copy."); } };
  return <div className="db db-pop"><div className="db-sheet panel tool-win ref-win" role="dialog" aria-label="Floating reference">
    <header className="panel-head" data-tauri-drag-region><div data-tauri-drag-region><h2>{note?.title || "Reference"}</h2></div><div className="pn-act"><button className="ghost field" onClick={() => void copy()} disabled={!note}>Copy</button><button className="ghost" onClick={() => void close()} aria-label="Close reference">Close</button></div></header>
    {err ? <p className="pn-empty" role="alert">{err}</p> : <div className="ref-body">{note?.body}</div>}
    <p className="pn-msg" role="status">{msg}</p>
  </div></div>;
}

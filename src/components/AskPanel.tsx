import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AiError, askNotes, useAi } from "../ai";
import { repo } from "../useNotes";
import type { Note } from "../domain";

export function AskPanel({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const ai = useAi();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ answer: string; used: Note[] } | null>(null);
  const [err, setErr] = useState("");
  const ctl = useRef<AbortController>();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); return () => ctl.current?.abort(); }, []);
  if (!ai) return null;
  const go = async () => {
    if (!q.trim() || busy) return; setBusy(true); setErr(""); setRes(null); ctl.current = new AbortController();
    try { setRes(await askNotes(ai, q, await repo.list({ view: "all", query: "" }), ctl.current.signal)); }
    catch (e) { setErr(e instanceof AiError ? e.message : "Couldn't get an answer."); } finally { setBusy(false); }
  };
  return (
    <motion.div className="db-veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
      <motion.div className="db-sheet ask" role="dialog" aria-modal="true" aria-label="Ask your notes" initial={{ y: 16, scale: 0.97 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
        <div className="ask-in">
          <h2>Ask your notes</h2>
          <form onSubmit={e => { e.preventDefault(); void go(); }}>
            <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="When is the tram booked?" aria-label="Question" maxLength={500} />
            <button className="primary" type="submit" disabled={busy || !q.trim()}>{busy ? "Thinking" : "Ask"}</button>
          </form>
          {err && <p className="ask-err" role="alert">{err}</p>}
          {res && (<div className="ask-res" role="status">
            <p>{res.answer}</p>
            <div className="ask-src"><span>Looked at</span>{res.used.map((n, i) => <button key={n.id} onClick={() => { onClose(); onOpen(n.id); }}><em>{i + 1}</em>{n.title}</button>)}</div>
          </div>)}
          <p className="ask-note">Sends the best-matching notes to {new URL(ai.baseUrl).host}. Nothing else leaves this device.</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

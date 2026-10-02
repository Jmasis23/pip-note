import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AiError, useAi } from "../ai";
import { applyOps, runAgent, type AgentResult, type Op } from "../agent";
import { repo } from "../useNotes";
import type { Note } from "../domain";

export function AskPanel({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const ai = useAi();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AgentResult | null>(null);
  const [step, setStep] = useState(""); const [applied, setApplied] = useState<string>("");
  const [err, setErr] = useState("");
  const ctl = useRef<AbortController>();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); return () => ctl.current?.abort(); }, []);
  if (!ai) return null;
  const go = async () => {
    if (!q.trim() || busy) return; setBusy(true); setErr(""); setRes(null); setApplied(""); setStep(""); ctl.current = new AbortController();
    try { setRes(await runAgent(ai, q, repo, { signal: ctl.current.signal, onStep: setStep })); }
    catch (e) { setErr(e instanceof AiError ? e.message : "Couldn't get an answer."); } finally { setBusy(false); setStep(""); }
  };
  const apply = async () => { if (!res) return; const r = await applyOps(res.ops, repo); setApplied(r.skipped.length ? `Applied ${r.done}. Skipped ${r.skipped.length} that changed meanwhile.` : `Applied ${r.done} change${r.done === 1 ? "" : "s"}.`); setRes({ ...res, ops: [] }); window.dispatchEvent(new Event("pip:changed")); input.current?.focus(); };
  return (
    <motion.div className="db-veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
      <motion.div className="db-sheet ask" role="dialog" aria-modal="true" aria-label="Ask your notes" initial={{ y: 16, scale: 0.97 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
        <div className="ask-in">
          <h2>Ask your notes</h2>
          <form onSubmit={e => { e.preventDefault(); void go(); }}>
            <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Ask, or: tidy my travel notes" aria-label="Question" maxLength={500} />
            <button className="primary" type="submit" disabled={busy || !q.trim()}>{busy ? "Working" : "Ask"}</button>
          </form>
          {busy && step && <p className="ask-step" role="status">{step}</p>}
          {err && <p className="ask-err" role="alert">{err}</p>}
          {res && (<div className="ask-res" role="status">
            <p>{res.message}</p>
            {res.ops.length > 0 && <div className="ask-ops"><ul>{res.ops.map((o, i) => <li key={i}>{opView(o)}</li>)}</ul><div className="ask-opsbar"><button className="primary" onClick={() => void apply()}>Apply {res.ops.length}</button><button onClick={() => { setRes({ ...res, ops: [] }); input.current?.focus(); }}>Discard</button></div></div>}
            {applied && <p className="ask-done">{applied}</p>}
            <div className="ask-src">{res.looked.length > 0 && <span>Looked at</span>}{res.looked.map((n, i) => <button key={n.id} onClick={() => { onClose(); onOpen(n.id); }}><em>{i + 1}</em>{n.title}</button>)}</div>
          </div>)}
          <p className="ask-note">Pip reads notes it needs and sends them to {new URL(ai.baseUrl).host}. It only proposes changes. Nothing is saved until you apply.</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function opView(o: Op) {
  if (o.kind === "create") return <><b>New note</b> {o.title}{o.folder ? <i> in {o.folder}</i> : null}</>;
  const bits = [o.title !== undefined && `title to "${o.title}"`, o.body !== undefined && "text changed", o.folder !== undefined && (o.folder ? `folder to ${o.folder}` : "folder removed"), o.pinned !== undefined && (o.pinned ? "pinned" : "unpinned")].filter(Boolean);
  return <><b>{o.before.title || "Untitled"}</b> <i>{bits.join(", ")}</i></>;
}

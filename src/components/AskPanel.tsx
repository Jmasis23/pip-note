import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { AiError, useAi } from "../ai";
import { applyOps, runAgent, type AgentResult, type Op } from "../agent";
import { repo } from "../useNotes";
import type { Note } from "../domain";

const IDEAS = ["File my loose notes where they belong", "When did I plan the tram?", "Tidy my travel notes", "Pull this week's tasks into one note"];
type Step = { id: number; text: string; done: boolean };
const hostOf = (u: string) => { if (u === "chatgpt") return "ChatGPT"; try { return new URL(u).host; } catch { return "your AI provider"; } };
const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

function Spark({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <svg className={`as-spark ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden><path d="M12 1.5c.7 5.6 2.4 8.1 4.800 9.200 1.600.8 3.600 1.200 5.700 1.300-5.600.7-8.100 2.400-9.200 4.800-.8 1.600-1.200 3.600-1.300 5.700-.7-5.600-2.400-8.100-4.800-9.200C6.100 12.500 4.100 12.100 2 12c5.600-.7 8.100-2.400 9.200-4.800.8-1.600 1.200-3.600 1.300-5.700z" fill="currentColor"/></svg>;
}

function Burst() {
  const dots = useMemo(() => Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2 + 0.3; const r = 54 + (i % 3) * 14; return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7, s: 8 + (i % 3) * 3, d: i * 0.02 }; }), []);
  return <span className="as-burst" aria-hidden>{dots.map((d, i) => <motion.i key={i} initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }} animate={{ x: d.x, y: d.y, scale: [0, 1, 0], opacity: [1, 1, 0], rotate: 90 }} transition={{ duration: 0.9, delay: d.d, ease: "easeOut" }}><Spark size={d.s} /></motion.i>)}</span>;
}

function Typed({ text }: { text: string }) {
  const words = text.split(" ");
  return <p className="as-msg">{words.map((w, i) => <motion.span key={i} initial={{ opacity: 0, y: 5, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ delay: i * 0.035, duration: 0.35, ease: "easeOut" }}>{w}{" "}</motion.span>)}</p>;
}

export function AskPanel({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const ai = useAi();
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AgentResult | null>(null); const [err, setErr] = useState("");
  const [steps, setSteps] = useState<Step[]>([]); const [peek, setPeek] = useState<Note[]>([]);
  const [phase, setPhase] = useState<"idle" | "applying" | "done">("idle"); const [applied, setApplied] = useState("");
  const [idea, setIdea] = useState(0);
  const ctl = useRef<AbortController>(); const input = useRef<HTMLInputElement>(null); const seq = useRef(0);
  useEffect(() => { input.current?.focus(); return () => ctl.current?.abort(); }, []);
  useEffect(() => { if (q || busy || res) return; const t = setInterval(() => setIdea(i => (i + 1) % IDEAS.length), 3200); return () => clearInterval(t); }, [q, busy, res]);
  if (!ai) return null;

  const go = async (text = q) => {
    if (!text.trim() || busy) return; setBusy(true); setErr(""); setRes(null); setApplied(""); setPhase("idle"); setSteps([]); setPeek([]); ctl.current = new AbortController();
    try {
      const r = await runAgent(ai, text, repo, { signal: ctl.current.signal, onStep: (t, notes) => {
        setSteps(s => [...s.map(x => ({ ...x, done: true })), { id: ++seq.current, text: t, done: false }].slice(-4));
        if (notes?.length) setPeek(p => { const m = new Map(p.map(n => [n.id, n])); notes.forEach(n => m.set(n.id, n)); return [...m.values()].slice(-5); });
      } });
      setSteps(s => s.map(x => ({ ...x, done: true }))); setRes(r);
    } catch (e) { setErr(e instanceof AiError ? e.message : "Couldn't get an answer."); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!res || phase !== "idle") return; setPhase("applying");
    const r = await applyOps(res.ops, repo); window.dispatchEvent(new Event("pip:changed"));
    setApplied(r.skipped.length ? `Applied ${r.done}. Skipped ${r.skipped.length} that changed meanwhile.` : `Done. ${r.done} change${r.done === 1 ? "" : "s"} made.`); setPhase("done");
    setTimeout(onClose, 1500);
  };
  const discard = () => { setRes(r => r && { ...r, ops: [] }); input.current?.focus(); };
  const showIdeas = !busy && !res && !q;

  return (
    <MotionConfig reducedMotion="user">
      <motion.div className="db-veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
        <motion.div layout className={`db-sheet ask as ${busy ? "is-busy" : ""}`} role="dialog" aria-modal="true" aria-label="Ask your notes" initial={{ y: 22, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 340, damping: 30 }}>
          <span className="as-glow" aria-hidden />
          <motion.div layout className="ask-in">
            <div className="as-head"><h2>Ask Pip</h2><Spark size={20} className={busy ? "live" : ""} /></div>
            <form className="as-form" onSubmit={e => { e.preventDefault(); void go(); }}>
              <div className="as-field">
                <input ref={input} value={q} onChange={e => setQ(e.target.value)} aria-label="Question" maxLength={500} disabled={busy} placeholder="" />
                <AnimatePresence>{showIdeas && <motion.span key={idea} className="as-ph" aria-hidden initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }}>{IDEAS[idea]}</motion.span>}</AnimatePresence>
              </div>
              <motion.button whileTap={{ scale: 0.94 }} className="primary as-go" type="submit" disabled={busy || !q.trim()} aria-label="Ask">{busy ? <span className="as-dots"><i /><i /><i /></span> : "Ask"}</motion.button>
            </form>
            <AnimatePresence>{showIdeas && <motion.div className="as-ideas" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{IDEAS.slice(0, 3).map((t, i) => <motion.button key={t} type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.07 }} onClick={() => { setQ(t); void go(t); }}>{t}</motion.button>)}</motion.div>}</AnimatePresence>

            <AnimatePresence initial={false}>{busy && <motion.div className="as-think" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="status">
              <ul>{steps.map(s => <motion.li key={s.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: s.done ? 0.5 : 1, x: 0 }} transition={spring}>{s.done ? <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 8.500l3.200 3L13 4.500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : <span className="as-spin" />}<span>{s.text}</span></motion.li>)}
                {!steps.length && <li><span className="as-spin" /><span>Thinking</span></li>}</ul>
              <div className="as-peek"><AnimatePresence>{peek.map(n => <motion.span key={n.id} layout initial={{ opacity: 0, y: 14, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring}>{n.title || "Untitled"}</motion.span>)}</AnimatePresence></div>
            </motion.div>}</AnimatePresence>

            {err && <p className="ask-err" role="alert">{err}</p>}

            <AnimatePresence>{res && <motion.div className="as-res" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
              <Typed text={res.message} />
              {res.ops.length > 0 && <div className="as-ops">
                {res.ops.map((o, i) => <motion.div key={i} className={`as-op ${phase !== "idle" ? "ok" : ""}`} initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring, delay: 0.5 + i * 0.12 }}>
                  <span className="as-tick">{phase !== "idle" ? <motion.svg width="14" height="14" viewBox="0 0 16 16" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}><motion.path d="M3 8.500l3.200 3L13 4.500" fill="none" stroke="currentColor" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: i * 0.12, duration: 0.3 }} /></motion.svg> : <Spark size={12} />}</span>
                  <OpView o={o} />
                </motion.div>)}
                <motion.div className="as-bar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 + res.ops.length * 0.12 }}>
                  <div className="as-btnwrap"><motion.button whileTap={{ scale: 0.95 }} className={`primary as-apply ${phase === "done" ? "done" : ""}`} onClick={() => void apply()} disabled={phase !== "idle"}>{phase === "done" ? "Done" : phase === "applying" ? "Applying" : `Apply ${res.ops.length}`}</motion.button>{phase === "done" && <Burst />}</div>
                  {phase === "idle" && <button className="as-quiet" onClick={discard}>Discard</button>}
                </motion.div>
              </div>}
              {applied && <motion.p className="ask-done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{applied}</motion.p>}
              {res.looked.length > 0 && phase === "idle" && <div className="ask-src"><span>Looked at</span>{res.looked.map((n, i) => <button key={n.id} onClick={() => { onClose(); onOpen(n.id); }}><em>{i + 1}</em>{n.title}</button>)}</div>}
            </motion.div>}</AnimatePresence>
            <p className="ask-note">Pip reads only the notes it needs and sends them to {hostOf(ai.baseUrl)}. It proposes, you decide. Nothing saves until you apply.</p>
          </motion.div>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}

function OpView({ o }: { o: Op }) {
  if (o.kind === "create") return <span className="as-optxt"><b>New note</b> {o.title}{o.folder ? <i> in {o.folder}</i> : null}</span>;
  const bits = [o.title !== undefined && `renamed "${o.title}"`, o.body !== undefined && "text updated", o.folder !== undefined && (o.folder ? `moved to ${o.folder}` : "folder removed"), o.pinned !== undefined && (o.pinned ? "pinned" : "unpinned")].filter(Boolean);
  return <span className="as-optxt"><b>{o.before.title || "Untitled"}</b> <i>{bits.join(", ")}</i></span>;
}

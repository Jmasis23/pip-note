import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Note } from "../domain";
import { repo } from "../useNotes";
import { aiAvailable, aiComplete, aiStatus } from "../ai/client";
import { askMessages, parsePlan, when, type Action, type Plan } from "../ai/plan";
import { addReminder } from "../ai/reminders";
import "./ai.css";

const ideas = ["Remind me to call Mia tomorrow at 9am", "Packing list: passport, charger, adapter", "Make a note about Friday's plan"];
type Phase = { s: "idle" } | { s: "busy" } | { s: "plan"; plan: Plan } | { s: "done"; msg: string } | { s: "err"; msg: string };

export function AskPip({ notes, now }: { notes: Note[]; now: number }) {
  const [text, setText] = useState("");
  const [ph, setPh] = useState<Phase>({ s: "idle" });
  const [ready, setReady] = useState<boolean | null>(null);
  const [idea] = useState(() => ideas[Math.floor(Date.now() / 6e4) % ideas.length]);
  const run = useRef(0);
  useEffect(() => { if (!aiAvailable()) { setReady(false); return; } void aiStatus().then(s => setReady(!!s.primary)).catch(() => setReady(false)); }, [ph.s]);
  if (!aiAvailable()) return null;

  const ask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = text.trim(); if (!q || ph.s === "busy") return;
    const my = ++run.current;
    setPh({ s: "busy" });
    try {
      const st = await aiStatus();
      if (!st.primary) { setPh({ s: "err", msg: "Add an AI key in Settings first." }); return; }
      const refs = notes.filter(n => n.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40).map(n => ({ id: n.id, title: n.title, folder: n.folder ?? undefined, updatedAt: n.updatedAt }));
      const out = await aiComplete(askMessages(q, Date.now(), refs));
      if (my !== run.current) return;
      const plan = parsePlan(out, Date.now(), new Set(refs.map(r => r.id)), q);
      setPh(plan.actions.length ? { s: "plan", plan } : { s: "done", msg: plan.say || "Nothing to do." });
    } catch (x) { if (my === run.current) setPh({ s: "err", msg: String((x as Error)?.message ?? x).slice(0, 160) }); }
  };
  const cancel = () => { run.current++; setPh({ s: "idle" }); };
  const exec = async (plan: Plan) => {
    setPh({ s: "busy" });
    try {
      let made = 0, rem = 0, rew = 0;
      for (const a of plan.actions) {
        if (a.type === "create_note") { await repo.create({ title: a.title, body: a.body, checklist: a.checklist.map(t => ({ id: crypto.randomUUID(), text: t, done: false })), folder: a.folder || undefined }); made++; }
        else if (a.type === "reminder") { addReminder({ text: a.text, at: a.at, noteId: a.noteId }); rem++; }
        else if (a.type === "folder") { const n = await repo.get(a.noteId); await repo.update(n.id, n.revision, { folder: a.folder }); rew++; }
        else { const n = await repo.get(a.noteId); await repo.update(n.id, n.revision, { ...(a.title ? { title: a.title } : {}), body: a.body, rich: undefined }); rew++; }
      }
      window.dispatchEvent(new Event("pip:changed"));
      const bits = [made && `${made} ${made === 1 ? "note" : "notes"} added`, rem && `${rem} ${rem === 1 ? "reminder" : "reminders"} set`, rew && `${rew} rewritten`].filter(Boolean);
      setText(""); setPh({ s: "done", msg: bits.join(", ") + "." });
    } catch { setPh({ s: "err", msg: "That didn't save. Nothing was lost." }); }
  };

  return <div className="ask" data-s={ph.s}>
    <form onSubmit={ask} role="search" aria-label="Ask Pip">
      <span className="ask-dot" aria-hidden />
      <input value={text} onChange={e => { setText(e.target.value); if (ph.s === "done" || ph.s === "err") setPh({ s: "idle" }); }} placeholder={ready === false ? "Ask Pip (add a key in Settings)" : `Ask Pip. Try "${idea}"`} aria-label="Ask Pip" maxLength={1000} />
      <button className="ask-go" disabled={!text.trim() || ph.s === "busy"} aria-label="Send">{ph.s === "busy" ? <i className="ask-spin" aria-hidden /> : <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden><path d="M10 16V4M5 9l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}</button>
    </form>
    <AnimatePresence mode="wait" initial={false}>
      {ph.s === "plan" && <motion.div key="plan" className="ask-card" role="group" aria-label="Pip's plan" initial={{ opacity: 0, y: -8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
        {ph.plan.say && <p className="ask-say">{ph.plan.say}</p>}
        <ul>{ph.plan.actions.map((a, i) => <li key={i}><Row a={a} now={now} /></li>)}</ul>
        <div className="ask-btns"><button className="ask-ok" onClick={() => void exec(ph.plan)} autoFocus>Do it</button><button className="ask-no" onClick={cancel}>Cancel</button></div>
      </motion.div>}
      {(ph.s === "done" || ph.s === "err") && <motion.p key="msg" className={ph.s === "err" ? "ask-msg bad" : "ask-msg"} role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{ph.msg}</motion.p>}
    </AnimatePresence>
  </div>;
}

function Row({ a, now }: { a: Action; now: number }) {
  if (a.type === "create_note") return <><b>New note</b><span>{a.title}</span>{a.checklist.length > 0 && <small>{a.checklist.length} {a.checklist.length === 1 ? "item" : "items"}: {a.checklist.slice(0, 3).join(", ")}{a.checklist.length > 3 ? "..." : ""}</small>}{!a.checklist.length && a.body && <small>{a.body.slice(0, 90)}</small>}</>;
  if (a.type === "reminder") return <><b>Reminder</b><span>{a.text}</span><small>{when(a.at, now)}</small></>;
  if (a.type === "folder") return <><b>Move</b><span>Note to {a.folder}</span></>;
  return <><b>Rewrite</b><span>{a.title ?? "This note"}</span><small>{a.body.slice(0, 90)}</small></>;
}

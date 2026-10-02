import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Pip } from "../components/Pip";
import { repo } from "../useNotes";
import { isNative } from "../native";
import { AuthError, finishRedirect, freshSession, loadSession, signInChatGpt, signInGoogle } from "./auth";
import type { Session } from "./auth";
import { startSync, syncNow, syncStatus } from "./sync";
import "@fontsource-variable/inter";
import "./gate.css";

type Phase = "boot" | "wall" | "syncing" | "back" | "tour" | "app";
const doneKey = (uid: string) => `pip.onboarded.${uid}`;
const first = (s: Session) => (s.user.name ?? "").trim().split(/\s+/)[0];
const hi = (s: Session, lead: string) => first(s) ? `${lead}, ${first(s)}` : lead;

function Frame({ children, k }: { children: React.ReactNode; k: string }) {
  return <MotionConfig reducedMotion="user"><motion.main key={k} className="gt" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.main></MotionConfig>;
}

function Wall({ onIn }: { onIn: (s: Session) => void }) {
  const [busy, setBusy] = useState<"" | "google" | "chatgpt">(""); const [err, setErr] = useState("");
  const run = async (which: "google" | "chatgpt") => {
    setBusy(which); setErr("");
    try { const s = which === "google" ? await signInGoogle() : await signInChatGpt(); if (s) onIn(s); else setBusy(""); }
    catch (e) { setErr(e instanceof AuthError ? e.message : "Something went wrong. Try again."); setBusy(""); }
  };
  return <Frame k="wall">
    <div className="gt-mascot"><Pip size={72} look /></div>
    <h1>Pip</h1>
    <p className="gt-tag">Need it later? Pip it.</p>
    <div className="gt-btns">
      <button className="gt-btn main" disabled={!!busy} onClick={() => run("google")}><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.100 3.600l6.800-6.800C35.800 2.400 30.300 0 24 0 14.600 0 6.500 5.400 2.600 13.200l7.900 6.100C12.400 13.600 17.700 9.500 24 9.500z"/><path fill="#4285F4" d="M46.500 24.500c0-1.600-.1-3.100-.4-4.500H24v9h12.700c-.6 3-2.300 5.500-4.800 7.200l7.500 5.800c4.400-4.100 7.100-10.100 7.100-17.500z"/><path fill="#FBBC05" d="M10.500 28.700A14.500 14.500 0 0 1 9.500 24c0-1.600.3-3.200.8-4.700l-7.900-6.100A24 24 0 0 0 0 24c0 3.900.9 7.500 2.600 10.800l7.900-6.100z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.500-5.800c-2.100 1.400-4.800 2.300-8.400 2.300-6.300 0-11.600-4.100-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z"/></svg>{busy === "google" ? "Waiting for your browser..." : "Continue with Google"}</button>
      <button className="gt-btn" disabled={!!busy || !isNative()} onClick={() => run("chatgpt")}>{busy === "chatgpt" ? "Waiting for your browser..." : "Continue with ChatGPT"}</button>
    </div>
    {busy && <p className="gt-hint">A window opened in your browser. Finish there and Pip comes back by itself.</p>}
    {err && <p className="gt-err" role="alert">{err}</p>}
    {!isNative() && !busy && <p className="gt-hint">ChatGPT sign-in is in the Windows app.</p>}
    <p className="gt-fine">An account keeps your notes with you on every PC. Notes are stored as plain text in Pip's private cloud, only your account can read them.</p>
  </Frame>;
}

function Back({ s, n, onGo }: { s: Session; n: number; onGo: () => void }) {
  return <Frame k="back">
    <div className="gt-mascot"><Pip size={72} state="saved" /></div>
    <h1>{hi(s, "Welcome back")}</h1>
    <p className="gt-tag">{n === 1 ? "1 note is" : `${n} notes are`} back where you left {n === 1 ? "it" : "them"}.</p>
    <div className="gt-btns"><button className="gt-btn main" autoFocus onClick={onGo}>Open Pip</button></div>
    <p className="gt-fine">A copy of this PC's notes was saved first, in Settings under Backups ("before-sync").</p>
  </Frame>;
}

const WELCOME = { title: "Welcome to Pip", body: "Pip catches a thought the moment you have it. Try the list below.", checklist: ["Press Ctrl+Shift+Space anywhere to capture", "Shake the mouse to open the capture box", "Drag a note card to a folder in the dock", "Search from the dock, it looks inside every note", "Connect ChatGPT in Settings to unlock Ask, which can organize your notes"] };

function Tour({ s, onDone }: { s: Session; onDone: () => void }) {
  const [step, setStep] = useState(0); const [text, setText] = useState(""); const [err, setErr] = useState(""); const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (step === 1) ta.current?.focus(); }, [step]);
  const finish = async (skip: boolean) => {
    const notes = await repo.list({ view: "all", query: "" });
    if (!notes.some(n => n.title === WELCOME.title)) await repo.create({ title: WELCOME.title, body: WELCOME.body, pinned: false, checklist: WELCOME.checklist.map((t, i) => ({ id: `w${i}`, text: t, done: false })) });
    localStorage.setItem(doneKey(s.user.id), "1"); void skip; onDone();
  };
  const save = async () => {
    if (!text.trim()) { setErr("Type a thought first, anything works."); return; }
    try { await repo.create({ body: text }); await finish(false); } catch (e) { setErr((e as Error).message); }
  };
  return <Frame k={`tour${step}`}>
    {step === 0 && <>
      <div className="gt-mascot"><Pip size={72} state="saved" /></div>
      <h1>{hi(s, "You're in")}</h1>
      <p className="gt-tag">Two ways to capture a thought from anywhere on your PC.</p>
      <div className="gt-keys"><div><i className="kk"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Space</kbd></i><span>Open the capture box</span></div><div><i className="kk"><kbd>Shake</kbd></i><span>Wiggle the mouse, it opens too</span></div></div>
      <div className="gt-btns"><button className="gt-btn main" autoFocus onClick={() => setStep(1)}>Try it</button><button className="gt-link" onClick={() => finish(true)}>Skip, take me in</button></div>
    </>}
    {step === 1 && <>
      <h1>Your first thought</h1>
      <p className="gt-tag">What's one thing you don't want to forget?</p>
      <textarea ref={ta} className="gt-ta" value={text} placeholder="Call the dentist about Thursday..." onChange={e => { setText(e.target.value); setErr(""); }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void save(); }} />
      {err && <p className="gt-err" role="alert">{err}</p>}
      <div className="gt-btns"><button className="gt-btn main" onClick={save}>Pip it <small>Ctrl+Enter</small></button><button className="gt-link" onClick={() => finish(true)}>Skip, take me in</button></div>
    </>}
  </Frame>;
}

export default function Gate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("boot"); const [s, setS] = useState<Session | null>(null); const [back, setBack] = useState(0); const [syncErr, setSyncErr] = useState("");
  const enter = async (sess: Session) => {
    setS(sess);
    const known = localStorage.getItem(`pip.sync.cursor.${sess.user.id}`) !== null;
    if (known && localStorage.getItem(doneKey(sess.user.id))) { setPhase("app"); return; }
    setPhase("syncing"); await syncNow();
    const st = syncStatus();
    if (st.state === "error" || st.state === "offline") { setSyncErr(st.message); setPhase("wall"); return; }
    const pulled = st.last?.pulled ?? 0;
    if (pulled > 0) { localStorage.setItem(doneKey(sess.user.id), "1"); setBack(pulled); setPhase("back"); } else setPhase(localStorage.getItem(doneKey(sess.user.id)) ? "app" : "tour");
  };
  useEffect(() => {
    void (async () => {
      try { const r = await finishRedirect(); if (r) { await enter(r); return; } } catch { /* fall through to the wall */ }
      const cur = loadSession() ? await freshSession() : null;
      if (cur) await enter(cur); else setPhase("wall");
    })();
  }, []);
  useEffect(() => { if (phase !== "app" || !s) return; return startSync(); }, [phase, s]);
  return <>
    {phase === "app" ? children : <div className="gt-root"><AnimatePresence mode="wait">
      {phase === "wall" && <Wall key="wall" onIn={enter} />}
      {phase === "syncing" && <Frame k="syncing"><div className="gt-mascot"><Pip size={72} state="saving" /></div><p className="gt-tag">{syncErr || "Getting your notes..."}</p></Frame>}
      {phase === "back" && s && <Back key="back" s={s} n={back} onGo={() => setPhase("app")} />}
      {phase === "tour" && s && <Tour key="tour" s={s} onDone={() => setPhase("app")} />}
    </AnimatePresence></div>}
  </>;
}

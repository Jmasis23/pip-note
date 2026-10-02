import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pip } from "../components/Pip";
import type { PipState } from "../components/Pip";
import { Editor } from "../components/Editor";
import { Settings } from "../components/Settings";
import { repo, useNotes } from "../useNotes";
import type { Note, View } from "../domain";
import { dayLabel, preview, useFull, useTriggers, when } from "./util";
import "@fontsource-variable/onest";
import "./c.css";

const VIEWS: { id: View; label: string }[] = [{ id: "all", label: "All" }, { id: "today", label: "Today" }, { id: "pinned", label: "Pinned" }, { id: "trash", label: "Trash" }];

export default function DirC() {
  const { view, setView, query, setQuery, notes, counts, prefs, setPrefs, refresh } = useNotes();
  const [openId, setOpenId] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<PipState>("idle");
  const [status, setStatus] = useState("");
  const [summon, setSummon] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const full = useFull(openId, notes);

  useEffect(() => { repo.getDraft().then(d => { if (d) { setText(d.text); setStatus("Draft restored"); } }).catch(() => {}); }, []);
  useTriggers(prefs, () => { window.scrollTo({ top: 0, behavior: "smooth" }); area.current?.focus({ preventScroll: true }); setSummon(s => s + 1); setState("capturing"); }, settings);

  const keep = async () => {
    if (!text.trim()) { setStatus("Write something first."); return; }
    setState("saving"); setStatus("Saving");
    try { await repo.create({ body: text }); await repo.clearDraft(); setText(""); setState("saved"); setStatus("Got it. Saved."); await refresh(); setTimeout(() => { setState("idle"); setStatus(""); }, 1800); }
    catch { setState("error"); setStatus("Couldn't save. Your text is still here."); }
  };
  const draftSave = async () => { if (text.trim()) { try { await repo.saveDraft(text); setStatus("Draft kept"); } catch { setState("error"); setStatus("Couldn't keep your draft."); } } };

  const groups = useMemo(() => {
    const out: { label: string; items: Note[] }[] = [];
    notes.forEach(n => { const l = dayLabel(n.updatedAt); const g = out[out.length - 1]; if (g && g.label === l) g.items.push(n); else out.push({ label: l, items: [n] }); });
    return out;
  }, [notes]);

  return (
    <div className="dc">
      <header className="dc-top">
        <span className="dc-word">Pip</span>
        <nav aria-label="Views">{VIEWS.map(v => <button key={v.id} aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>{v.label}<em>{counts[v.id]}</em></button>)}</nav>
        <button className="dc-set" onClick={() => setSettings(true)}>Settings</button>
      </header>

      <section className="dc-composer">
        <motion.div key={summon} className="dc-ring" initial={{ opacity: summon ? 1 : 0, scale: 0.985 }} animate={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.9 }} />
        <div className="dc-pip"><Pip size={64} state={state} look={state === "idle" || state === "capturing"} /></div>
        <div className="dc-field">
          <textarea ref={area} value={text} rows={2} placeholder="Something on your mind?" aria-label="Capture a note"
            onChange={e => { setText(e.target.value); setState("capturing"); setStatus(""); }}
            onBlur={() => void draftSave()}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void keep(); } if (e.key === "Escape") { void draftSave(); area.current?.blur(); } }} />
          <div className="dc-bar">
            <span className={`status ${state === "error" ? "bad" : ""}`} role="status" aria-live="polite">{status || `Shake the mouse or press ${prefs.shortcut.replace(/\+/g, " ")} to jump here`}</span>
            <button className="dc-keep" onClick={() => void keep()} disabled={state === "saving" || !text.trim()}>Keep it</button>
          </div>
        </div>
      </section>

      <input className="dc-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your notes" aria-label="Search notes" />

      <div className="dc-stream">
        {groups.map(g => (
          <div className="dc-day" key={g.label}>
            <h2>{g.label}</h2>
            <ul>
              <AnimatePresence initial={false}>
                {g.items.map(n => (
                  <motion.li key={n.id} layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>
                    <time>{when(n.updatedAt)}</time>
                    <i className={n.pinned ? "dot pin" : "dot"} aria-hidden />
                    <div className={`dc-note ${openId === n.id ? "open" : ""}`}>
                      <button className="dc-head" onClick={() => setOpenId(openId === n.id ? null : n.id)} aria-expanded={openId === n.id}>
                        <b>{n.title}</b>
                        {openId !== n.id && <span>{preview(n) || "Empty note"}</span>}
                      </button>
                      <AnimatePresence initial={false}>
                        {openId === n.id && full && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: [0.3, 0.9, 0.3, 1] }} style={{ overflow: "hidden" }}>
                            <Editor key={full.id} note={full} onChanged={() => void refresh()} onBack={() => setOpenId(null)} />
                          </motion.div>)}
                      </AnimatePresence>
                    </div>
                  </motion.li>))}
              </AnimatePresence>
            </ul>
          </div>))}
        {notes.length === 0 && <p className="dc-empty">{query ? "Nothing matches that." : "Nothing kept yet. Type above."}</p>}
      </div>
      {settings && <Settings prefs={prefs} setPrefs={setPrefs} onClose={() => setSettings(false)} onRestored={() => void refresh()} />}
    </div>
  );
}

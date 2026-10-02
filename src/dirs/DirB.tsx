import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { Pip } from "../components/Pip";
import { Capture } from "../components/Capture";
import { Editor } from "../components/Editor";
import { Settings } from "../components/Settings";
import { AskPanel } from "../components/AskPanel";
import { Titlebar } from "../components/Titlebar";
import { cleanFolder } from "../repo/repo";
import { useAi } from "../ai";
import { initStorage, isNative, onNativeEvent, syncDesktopPrefs } from "../native";
import { repo, useNotes } from "../useNotes";
import type { Note, View } from "../domain";
import { preview, useFull, useTriggers, when } from "./util";
import "@fontsource-variable/bricolage-grotesque";
import "./b.css";

const VIEWS: { id: View; label: string }[] = [{ id: "all", label: "All" }, { id: "today", label: "Today" }, { id: "pinned", label: "Pinned" }, { id: "trash", label: "Trash" }];
const tone = (n: Note) => n.pinned ? "lav" : n.checklist.length ? "mint" : Date.now() - n.updatedAt < 864e5 ? "peach" : "white";

export default function DirB() {
  const { folder, setFolder, folders, view, setView, query, setQuery, notes, counts, prefs, setPrefs, refresh } = useNotes();
  const [selId, setSelId] = useState<string | null>(null);
  const [capture, setCapture] = useState(false);
  const [settings, setSettings] = useState(false);
  const [ask, setAsk] = useState(false);
  const ai = useAi();
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = prefs.theme === "dark" || (prefs.theme === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.documentElement.dataset.motion = prefs.reducedMotion ? "reduced" : "full";
      const d = document.documentElement.dataset; d.accent = prefs.accent; d.cards = prefs.cardSize; d.text = prefs.textSize; d.tint = prefs.tint;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#12131A" : "#F7F7FB");
    };
    apply(); mq.addEventListener("change", apply); return () => mq.removeEventListener("change", apply);
  }, [prefs.theme, prefs.reducedMotion, prefs.accent, prefs.cardSize, prefs.textSize, prefs.tint]);
  const [toast, setToast] = useState("");
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const addFolder = async () => { const f = cleanFolder(newFolder ?? ""); setNewFolder(null); if (!f) return; if (!folders.includes(f)) await setPrefs({ ...prefs, extraFolders: [...new Set([...(prefs.extraFolders ?? []), f])] }); setView("all"); setFolder(f); await refresh(); };
  // Desktop: the capture box is its own small window. When it saves, reload the store and redraw the board.
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => { if (!isNative()) return; let off = () => {}; let dead = false; void onNativeEvent("pip://notes-changed", () => { void initStorage().then(() => refreshRef.current()); }).then(f => { if (dead) f(); else off = f; }); return () => { dead = true; off(); }; }, []);

  useEffect(() => { syncDesktopPrefs(prefs.shakeToCapture, prefs.shortcut); }, [prefs.shakeToCapture, prefs.shortcut]);
  useEffect(() => {
    const on = async (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (selId || capture || settings || ask || t?.closest("input, textarea, [contenteditable=true]")) return;
      const text = e.clipboardData?.getData("text/plain").trim(); if (!text) return;
      e.preventDefault();
      try { await repo.create({ body: text.slice(0, 20000), folder: view === "all" ? folder : "" }); await refresh(); setToast("Kept from clipboard"); window.setTimeout(() => setToast(""), 2200); } catch { setToast("Couldn't keep that"); window.setTimeout(() => setToast(""), 2200); }
    };
    window.addEventListener("paste", on); return () => window.removeEventListener("paste", on);
  }, [selId, capture, settings, ask, folder, view, refresh]);
  useTriggers(prefs, () => setCapture(true), capture || settings || ask);
  const full = useFull(selId, notes);
  useEffect(() => { if (!selId) return; const on = (e: KeyboardEvent) => { if (e.key === "Escape" && !capture) setSelId(null); }; window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on); }, [selId, capture]);

  return (
    <MotionConfig reducedMotion={prefs.reducedMotion ? "always" : "user"}>
    <div className={isNative() ? "db db-native" : "db"}>
      {isNative() && <Titlebar />}
      <header className="db-hero">
        <div className="db-mascot"><Pip size={92} look /></div>
        <div>
          <h1>Thought it?<br />Keep it.</h1>
          <p>Shake the mouse, or press <kbd>{prefs.shortcut.replace(/\+/g, " + ")}</kbd></p>
        </div>
        <button className="db-gear" onClick={() => setSettings(true)} aria-label="Settings">Settings</button>
      </header>

      {view !== "trash" && (() => {
        const top = [...new Set(folders.map(f => f.split("/")[0]))];
        const root = folder.split("/")[0];
        const kids = [...new Set(folders.filter(f => root && f.startsWith(root + "/")).map(f => f.split("/").slice(0, 2).join("/")))];
        const chip = (id: string, label: string) => <button key={id || "all"} className="db-chip" aria-pressed={folder === id} onClick={() => setFolder(folder === id ? (id.includes("/") ? id.split("/").slice(0, -1).join("/") : "") : id)}>{label}</button>;
        return (<div className="db-folders" role="group" aria-label="Folders">
          {chip("", "All folders")}{top.map(f => chip(f, f))}{kids.length > 0 && <i aria-hidden />}{kids.map(f => chip(f, f.split("/")[1]))}
          {newFolder === null
            ? <button className="db-chip db-chip-add" onClick={() => setNewFolder("")} aria-label="New folder"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>Folder</button>
            : <input className="db-chip-in" autoFocus value={newFolder} maxLength={60} placeholder="Folder name" aria-label="New folder name" onChange={e => setNewFolder(e.target.value)} onBlur={() => void addFolder()} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setNewFolder(null); }} />}
        </div>);
      })()}
      <LayoutGroup>
        <section className="db-board" aria-label="Notes">
          <AnimatePresence initial={false}>
            {notes.map((n, i) => (
              <motion.button key={n.id} layoutId={`card-${n.id}`} className={`db-card ${tone(n)}`} onClick={() => setSelId(n.id)}
                initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                whileHover={{ y: -4, rotate: i % 2 ? 0.5 : -0.5 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
                <b>{n.title}</b>
                <span className="db-pre">{preview(n) || "Empty note"}</span>
                {n.checklist.length > 0 && <span className="db-prog" aria-label={`${n.checklist.filter(c => c.done).length} of ${n.checklist.length} done`}>{n.checklist.map(c => <i key={c.id} className={c.done ? "d" : ""} />)}</span>}
                <time>{n.folder && <em className="db-fold">{n.folder.replace(/\//g, " / ")}</em>}{when(n.updatedAt)}</time>
              </motion.button>))}
          </AnimatePresence>
          {notes.length === 0 && <div className="db-empty"><Pip size={72} look /><p>{query ? "Nothing matches." : "Nothing kept yet."}</p></div>}
        </section>

        <AnimatePresence>
          {selId && (
            <motion.div className="db-veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) setSelId(null); }} onKeyDown={e => { if (e.key === "Escape") setSelId(null); }}>
              <motion.div layoutId={`card-${selId}`} className="db-sheet" transition={{ type: "spring", stiffness: 330, damping: 32 }}>
                {full && <Editor key={full.id} note={full} folders={folders} onChanged={() => void refresh()} onBack={() => setSelId(null)} />}
              </motion.div>
            </motion.div>)}
        </AnimatePresence>
      </LayoutGroup>

      <nav className="db-dock" aria-label="Views">
        <LayoutGroup id="dock">
          {VIEWS.map(v => (
            <button key={v.id} aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>
              {view === v.id && <motion.i layoutId="dock-on" className="db-dock-on" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
              <span>{v.label}</span><em>{counts[v.id]}</em>
            </button>))}
        </LayoutGroup>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search notes" />
        {ai && <button className="db-ask" onClick={() => setAsk(true)} aria-label="Ask your notes">Ask</button>}
        <button className="db-add" onClick={() => setCapture(true)} aria-label="New capture">Capture</button>
      </nav>

      <AnimatePresence>{ask && <AskPanel onClose={() => setAsk(false)} onOpen={id => setSelId(id)} />}</AnimatePresence>
      <AnimatePresence>{toast && <motion.div className="db-toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>{toast}</motion.div>}</AnimatePresence>
      <Capture open={capture} onClose={() => setCapture(false)} onSaved={() => void refresh()} />
      {settings && <Settings prefs={prefs} setPrefs={setPrefs} onClose={() => setSettings(false)} onRestored={() => void refresh()} />}
    </div>
    </MotionConfig>
  );
}
void repo;

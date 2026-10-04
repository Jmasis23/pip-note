import { Clipboard } from "../components/Clipboard";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { Pip } from "../components/Pip";
import { Capture } from "../components/Capture";
import { Editor } from "../components/Editor";
import { Settings } from "../components/Settings";
import { Titlebar } from "../components/Titlebar";
import { DraggableCard } from "./DraggableCard";
import { cleanFolder } from "../repo/repo";
import { TextStepper } from "../components/TextStepper";
import { initStorage, isNative, onNativeEvent, syncDesktopPrefs } from "../native";
import { repo, useNotes } from "../useNotes";
import type { CardPosition, Note, View } from "../domain";
import { imageFrom, imageNote, toDataUrl } from "../images";
import { preview, useFull, useTriggers, when } from "./util";
import "@fontsource-variable/inter";
import "./b.css";

const VIEWS: { id: View; label: string }[] = [{ id: "all", label: "All" }, { id: "today", label: "Today" }, { id: "pinned", label: "Pinned" }, { id: "drafts", label: "Drafts" }, { id: "trash", label: "Trash" }];
const tone = (n: Note, picked?: string) => picked ?? (n.pinned ? "lav" : n.checklist.length ? "mint" : Date.now() - n.updatedAt < 864e5 ? "peach" : "white");

export default function DirB() {
  const { folder, setFolder, folders, view, setView, query, setQuery, notes, drafts, counts, prefs, setPrefs, refresh } = useNotes();
  const [selId, setSelId] = useState<string | null>(null);
  const boardRef = useRef<HTMLElement>(null);
  const placementQueue = useRef<Promise<void>>(Promise.resolve());
  const [capture, setCapture] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const openCapture = (id?: string) => { setDraftId(id); setCapture(true); };
  const [settings, setSettings] = useState(false);
  useEffect(() => { const f = () => setSettings(true); window.addEventListener("pip:open-settings", f); return () => window.removeEventListener("pip:open-settings", f); }, []);
  const [clips, setClips] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = prefs.theme === "dark" || (prefs.theme === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.documentElement.dataset.motion = prefs.reducedMotion ? "reduced" : "full";
      const d = document.documentElement.dataset; d.accent = prefs.accent; d.cards = prefs.cardSize; d.text = prefs.textSize; d.tint = prefs.tint;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#07080C" : "#F7F7FB");
    };
    apply(); mq.addEventListener("change", apply); return () => mq.removeEventListener("change", apply);
  }, [prefs.theme, prefs.reducedMotion, prefs.accent, prefs.cardSize, prefs.textSize, prefs.tint]);
  const [toast, setToast] = useState("");
  const placeCard = (id: string, position: CardPosition): Promise<boolean> => {
    const pending = placementQueue.current.then(async () => {
      try {
        const current = await repo.getPrefs();
        await setPrefs({ ...current, cardPositions: { ...current.cardPositions, [id]: position } });
        return true;
      } catch {
        setToast("Couldn't save card position");
        window.setTimeout(() => setToast(""), 2200);
        return false;
      }
    });
    placementQueue.current = pending.then(() => undefined);
    return pending;
  };
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const addFolder = async () => { const f = cleanFolder(newFolder ?? ""); setNewFolder(null); if (!f) return; if (!folders.includes(f)) await setPrefs({ ...prefs, extraFolders: [...new Set([...(prefs.extraFolders ?? []), f])] }); setView("all"); setFolder(f); await refresh(); };
  // Desktop: the capture box is its own small window. When it saves, reload the store and redraw the board.
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => { if (!isNative()) return; let off = () => {}; let dead = false; void onNativeEvent("pip://notes-changed", () => { void initStorage().then(() => refreshRef.current()); }).then(f => { if (dead) f(); else off = f; }); return () => { dead = true; off(); }; }, []);

  useEffect(() => { syncDesktopPrefs(prefs.shakeToCapture, prefs.shortcut, prefs.shakeSens ?? 50); }, [prefs.shakeToCapture, prefs.shortcut, prefs.shakeSens]);
  useEffect(() => {
    const on = async (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (selId || capture || settings || clips || t?.closest("input, textarea, [contenteditable=true]")) return;
      const text = e.clipboardData?.getData("text/plain").trim(); const img = imageFrom(e.clipboardData ?? null); if (!text && !img) return;
      e.preventDefault();
      try { await repo.create(text ? { body: text.slice(0, 20000), folder: view === "all" ? folder : "" } : { ...imageNote(await toDataUrl(img!)), folder: view === "all" ? folder : "" }); await refresh(); setToast("Kept from clipboard"); window.setTimeout(() => setToast(""), 2200); } catch { setToast("Couldn't keep that"); window.setTimeout(() => setToast(""), 2200); }
    };
    window.addEventListener("paste", on); return () => window.removeEventListener("paste", on);
  }, [selId, capture, settings, clips, folder, view, refresh]);
  useTriggers(prefs, () => openCapture(), capture || settings || clips);
  const clearFilters = () => { setFolder(""); setQuery(""); setView("all"); };
  const viewName = VIEWS.find(v => v.id === view)?.label ?? "All";
  const context = `${folder ? folder + " / " : ""}${view === "all" ? "All notes" : viewName}`;
  const full = useFull(selId, notes);
  useEffect(() => { if (!selId) return; const on = (e: KeyboardEvent) => { if (e.key === "Escape" && !capture) setSelId(null); }; window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on); }, [selId, capture]);

  return (
    <MotionConfig reducedMotion={prefs.reducedMotion ? "always" : "user"}>
    <div className={isNative() ? "db db-native" : "db"}>
      {isNative() && <Titlebar />}
      <header className="db-hero">
        <div className="db-mascot"><Pip size={96} look /></div>
        <div>
          <div className="db-wm"><h1 aria-label="Pip">Pip<svg className="db-wm-spark" width="34" height="34" viewBox="0 0 34 34" aria-hidden><path d="M22 14l5-6M27 22l7-1M17 6l1-6" stroke="#FFC78B" strokeWidth="4" strokeLinecap="round" fill="none"/></svg></h1>
          <p className="db-sub">Quick notes, right where you are.</p></div>
          <p>Shake the mouse, or press <kbd>{prefs.shortcut.replace(/\+/g, " + ")}</kbd></p>
        </div>
        <div className="db-tools"><button className="ghost field" onClick={() => setClips(true)}>Clipboard</button><TextStepper value={prefs.textSize} onChange={v => void setPrefs({ ...prefs, textSize: v })} /><button className="db-gear" onClick={() => setSettings(true)} aria-label="Settings">Settings</button></div>
      </header>

      {view !== "trash" && view !== "drafts" && (() => {
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
      <div className="db-context"><div><h2>{context}</h2><p>{view === "drafts" ? drafts.length : notes.length} {view === "drafts" ? "drafts" : "notes"} shown{query ? ` matching "${query}"` : ""}. Navigation counts include all folders.</p></div>{(folder || query || view !== "all") && <button className="ghost field" onClick={clearFilters}>Show all notes</button>}</div>
      <LayoutGroup>
        {view === "drafts" ? (
          <section className="db-drafts" aria-label="Drafts">
            <p className="db-drafts-hint">Unfinished captures. Nothing here is lost until you delete it.</p>
            <AnimatePresence initial={false}>
              {drafts.map(d => (
                <motion.div key={d.id} className="db-draft" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
                  <button className="db-draft-open" onClick={() => openCapture(d.id)} aria-label={`Open draft: ${d.text.slice(0, 40)}`}>
                    <span className="db-pre">{d.text.replace(/\s+/g, " ").trim().slice(0, 180)}</span>
                    <time>{when(d.updatedAt)}</time>
                  </button>
                  <button className="db-draft-del" aria-label="Delete draft" onClick={async () => { await repo.deleteDraft(d.id); await refresh(); }}>Delete</button>
                </motion.div>))}
            </AnimatePresence>
            {drafts.length === 0 && <div className="db-empty"><Pip size={72} look /><p>No drafts. Press Esc in a capture to keep one here.</p></div>}
          </section>
        ) : (
        <section ref={boardRef} className="db-board" aria-label="Notes">
          <AnimatePresence initial={false}>
            {notes.map((n, i) => (
              <DraggableCard key={n.id} note={n} index={i} color={tone(n, prefs.noteColors?.[n.id])}
                position={prefs.cardPositions?.[n.id]} boardRef={boardRef} onOpen={() => setSelId(n.id)}
                onPlace={position => placeCard(n.id, position)} />))}
          </AnimatePresence>
          {notes.length === 0 && <div className="db-empty"><Pip size={72} look /><p>{query ? `No results for "${query}"` : view === "trash" ? "Trash is empty" : folder ? `No notes in ${folder}` : view === "pinned" ? "No pinned notes" : view === "today" ? "No notes today" : "Capture your first thought"}</p>{query ? <button className="primary" onClick={() => setQuery("")}>Clear search</button> : view !== "trash" ? <button className="primary" onClick={() => openCapture()}>{folder ? "Capture here" : "New capture"}</button> : <button className="ghost field" onClick={clearFilters}>Show all notes</button>}</div>}
        </section>)}

        <AnimatePresence>
          {selId && (
            <motion.div className="db-veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) setSelId(null); }} onKeyDown={e => { if (e.key === "Escape") setSelId(null); }}>
              <motion.div className="db-sheet" initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
                {full && <motion.div className="db-sheet-in" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, ease: "easeOut" }}><Editor key={full.id} note={full} folders={folders} color={prefs.noteColors?.[full.id] ?? null} onColor={c => { const m = { ...(prefs.noteColors ?? {}) }; if (c) m[full.id] = c; else delete m[full.id]; void setPrefs({ ...prefs, noteColors: m }); }} onChanged={() => void refresh()} onBack={() => setSelId(null)} /></motion.div>}
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
        <button className="db-add" onClick={() => openCapture()} aria-label="New capture">Capture</button>
      </nav>

      <AnimatePresence>{toast && <motion.div className="db-toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>{toast}</motion.div>}</AnimatePresence>
      <Capture open={capture} draftId={draftId} folder={folder} textSize={prefs.textSize} onTextSize={v => void setPrefs({ ...prefs, textSize: v })} onClose={() => { setCapture(false); void refresh(); }} onSaved={() => void refresh()} />
      {clips && <Clipboard onClose={() => setClips(false)} onKept={() => void refresh()} />}
      {settings && <Settings prefs={prefs} setPrefs={setPrefs} onClose={() => setSettings(false)} onRestored={() => void refresh()} />}
    </div>
    </MotionConfig>
  );
}
void repo;

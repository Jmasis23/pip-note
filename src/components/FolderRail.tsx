import { useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useDragControls, type PanInfo } from "motion/react";
import { Button as AriaButton } from "react-aria-components";
import { RiPushpin2Fill, RiPushpin2Line, RiDragMove2Line, RiArrowLeftSLine, RiLayoutRightLine } from "@remixicon/react";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { IconButton } from "@/components/base/buttons/icon-button";
import { CloseButton } from "@/components/base/buttons/close-button";
import type { Note } from "../domain";
import { preview, when } from "../dirs/util";
import "./rail.css";

const TINTS = ["peach", "mint", "lav", "white"] as const;
const tintOf = (name: string) => TINTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
const SPRING = { type: "spring", stiffness: 520, damping: 38 } as const;
const PANEL = { type: "spring", stiffness: 420, damping: 36, mass: 0.9 } as const;
type Float = { id: string; x: number; y: number };

export function FolderRail({ notes, folders, pinned, onTogglePin, onAddFolder, renderEditor }: {
  notes: Note[]; folders: string[]; pinned: string[];
  onTogglePin: (folder: string) => void;
  onAddFolder: (name: string) => Promise<string | null>;
  renderEditor: (id: string, back: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [floats, setFloats] = useState<Float[]>([]);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const controls = useDragControls();
  const panelOffset = useRef({ x: 0, y: 0 });

  const tops = useMemo(() => {
    const t = [...new Set(folders.map(f => f.split("/")[0]))].sort((a, b) => a.localeCompare(b));
    const p = t.filter(f => pinned.includes(f)), r = t.filter(f => !pinned.includes(f));
    return { p, r };
  }, [folders, pinned]);
  const inFolder = (f: string) => notes.filter(n => n.deletedAt === null && n.folder && (n.folder === f || n.folder.startsWith(f + "/")))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  const count = (f: string) => inFolder(f).length;

  const pick = (f: string) => { setCreating(false); setNoteId(null); setOpen(o => (o === f ? null : f)); };
  const close = () => { setOpen(null); setCreating(false); setNoteId(null); };
  const openNote = (id: string) => { if (floats.some(x => x.id === id)) { front(id); return; } setNoteId(id); };
  const front = (id: string) => setFloats(fs => { const f = fs.find(x => x.id === id); return f ? [...fs.filter(x => x.id !== id), f] : fs; });
  const outside = (p: { x: number; y: number }, o: { x: number; y: number }) => {
    const r = panelRef.current?.getBoundingClientRect(); if (!r) return false;
    const l = r.left - o.x, rt = r.right - o.x, t = r.top - o.y, b = r.bottom - o.y; // the panel's resting box
    return p.x < l - 24 || p.x > rt + 24 || p.y < t - 24 || p.y > b + 24;
  };
  const detach = (id: string, info: PanInfo, fromPanel = false) => {
    setDragging(false); if (!fromPanel) panelOffset.current = { x: 0, y: 0 };
    if (!outside(info.point, panelOffset.current)) return false;
    const x = Math.max(12, Math.min(window.innerWidth - 440, info.point.x - 210)), y = Math.max(12, Math.min(window.innerHeight - 160, info.point.y - 22));
    setFloats(fs => [...fs.filter(f => f.id !== id), { id, x, y }]);
    return true;
  };
  const dock = (id: string) => {
    const n = notes.find(x => x.id === id); const top = n?.folder?.split("/")[0];
    setFloats(fs => fs.filter(f => f.id !== id)); if (top) { setOpen(top); setCreating(false); setNoteId(id); }
  };

  const tile = (f: string) => {
    const on = open === f && !creating, isPin = pinned.includes(f);
    return <TooltipTrigger key={f}>
      <AriaButton className="fr-tile" data-tint={tintOf(f)} aria-label={`${f}, ${count(f)} notes`} aria-expanded={on} aria-controls="fr-panel" onPress={() => pick(f)}>
        {on && <motion.i layoutId="fr-on" className="fr-on" transition={SPRING} />}
        <motion.span className="fr-mono" whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }} transition={SPRING}>{[...f][0]?.toUpperCase()}</motion.span>
        {isPin && <b className="fr-pin" aria-hidden />}
      </AriaButton>
      <Tooltip placement="left" offset={12}>{f}<span className="fr-tt">{count(f)}</span></Tooltip>
    </TooltipTrigger>;
  };

  const submit = async (name: string) => { const f = await onAddFolder(name); if (f) { setCreating(false); setOpen(f.split("/")[0]); } else setCreating(false); };
  const cur = open ? inFolder(open) : [];
  const editing = noteId && !floats.some(f => f.id === noteId) ? noteId : null;

  return <>
    <nav className="fr" aria-label="Folders">
      <LayoutGroup id="rail">
        {tops.p.map(tile)}
        {tops.p.length > 0 && tops.r.length > 0 && <hr className="fr-sep" />}
        {tops.r.map(tile)}
        <TooltipTrigger>
          <AriaButton className="fr-tile fr-add" aria-label="New folder" onPress={() => { setOpen(null); setNoteId(null); setCreating(true); }}>
            {creating && <motion.i layoutId="fr-on" className="fr-on" transition={SPRING} />}
            <motion.span className="fr-mono" whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }} transition={SPRING}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </motion.span>
          </AriaButton>
          <Tooltip placement="left" offset={12}>New folder</Tooltip>
        </TooltipTrigger>
      </LayoutGroup>
    </nav>

    <AnimatePresence>
      {(open || creating) && (
        <motion.section key="panel" id="fr-panel" ref={panelRef} className="fr-panel" data-edit={editing ? "" : undefined} aria-label={creating ? "New folder" : open ?? ""}
          initial={{ opacity: 0, x: 36, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 28, scale: 0.97, transition: { duration: 0.16, ease: "easeIn" } }} transition={PANEL}
          drag={!!editing} dragControls={controls} dragListener={false} dragSnapToOrigin dragElastic={0.18} dragMomentum={false}
          onDragStart={() => setDragging(true)}
          onDragEnd={(_, info) => { if (editing) { panelOffset.current = info.offset; if (detach(editing, info, true)) setNoteId(null); } }}
          onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); if (editing) setNoteId(null); else close(); } }}>
          {creating ? <NewFolder onDone={submit} onCancel={() => setCreating(false)} /> : open && <>
            <header className="fr-head" onPointerDown={e => { if (editing && !(e.target as HTMLElement).closest("button")) controls.start(e); }} data-grab={editing ? "" : undefined}>
              {editing
                ? <IconButton size="small" icon={RiArrowLeftSLine} aria-label={`Back to ${open}`} onClick={() => setNoteId(null)} />
                : <span className="fr-badge" data-tint={tintOf(open)}>{[...open][0]?.toUpperCase()}</span>}
              <div className="fr-title"><strong>{open}</strong><small>{editing ? "Drag to pull this note out" : `${cur.length} ${cur.length === 1 ? "note" : "notes"}`}</small></div>
              <IconButton size="small" icon={pinned.includes(open) ? RiPushpin2Fill : RiPushpin2Line} aria-label={pinned.includes(open) ? `Unpin ${open}` : `Pin ${open}`} aria-pressed={pinned.includes(open)} className={pinned.includes(open) ? "fr-pinned" : ""} onClick={() => onTogglePin(open)} />
              <CloseButton aria-label="Close folder" onClick={close} />
            </header>
            <AnimatePresence mode="wait" initial={false}>
              {editing
                ? <motion.div key={"e" + editing} className="fr-edit" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12, transition: { duration: 0.1 } }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>{renderEditor(editing, () => setNoteId(null))}</motion.div>
                : <motion.ul key="list" className="fr-list" data-drag={dragging ? "" : undefined} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10, transition: { duration: 0.1 } }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                  {cur.map((n, i) => <Row key={n.id} n={n} i={i} sub={n.folder !== open ? n.folder!.slice(open.length + 1) : ""} floated={floats.some(f => f.id === n.id)}
                    onOpen={() => openNote(n.id)} onStart={() => setDragging(true)} onEnd={(info: PanInfo) => detach(n.id, info)} />)}
                  {cur.length === 0 && <li className="fr-empty">No notes in {open} yet. Pick this folder when you keep one.</li>}
                </motion.ul>}
            </AnimatePresence>
          </>}
        </motion.section>)}
    </AnimatePresence>

    <AnimatePresence>
      {floats.map((f, z) => <Floating key={f.id} f={f} z={z} onFront={() => front(f.id)} onClose={() => setFloats(fs => fs.filter(x => x.id !== f.id))} onDock={() => dock(f.id)}>
        {renderEditor(f.id, () => setFloats(fs => fs.filter(x => x.id !== f.id)))}
      </Floating>)}
    </AnimatePresence>
  </>;
}

function Row({ n, i, sub, floated, onOpen, onStart, onEnd }: { n: Note; i: number; sub: string; floated: boolean; onOpen: () => void; onStart: () => void; onEnd: (i: PanInfo) => boolean }) {
  const moved = useRef(false);
  const title = n.title.trim() || n.body.trim().split("\n")[0]?.slice(0, 60) || "Untitled";
  return <motion.li className="fr-row" data-floated={floated ? "" : undefined} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.025, duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    drag dragSnapToOrigin dragElastic={0.5} dragMomentum={false} whileDrag={{ scale: 1.03, zIndex: 80, boxShadow: "0 18px 40px -16px rgba(32,30,34,.45)" }} whileTap={{ scale: 0.985 }}
    onDragStart={() => { moved.current = true; onStart(); }} onDragEnd={(_, info) => { onEnd(info); window.setTimeout(() => { moved.current = false; }, 0); }}>
    <button className="fr-open" onClick={() => { if (!moved.current) onOpen(); }}>
      <span className="fr-rt">{title}</span>
      <span className="fr-rp">{preview(n) || (sub ? "" : "No text")}</span>
      <span className="fr-rm">{sub && <em>{sub}</em>}<time>{when(n.updatedAt)}</time>{n.pinned && <RiPushpin2Fill className="fr-rpin" aria-label="Pinned note" />}</span>
    </button>
  </motion.li>;
}

function NewFolder({ onDone, onCancel }: { onDone: (n: string) => void; onCancel: () => void }) {
  const [v, setV] = useState("");
  return <form className="fr-new" onSubmit={e => { e.preventDefault(); onDone(v); }}>
    <strong>New folder</strong>
    <input autoFocus value={v} maxLength={60} placeholder="Folder name" aria-label="Folder name" onChange={e => setV(e.target.value)} />
    <div><button type="button" className="fr-ghost" onClick={onCancel}>Cancel</button><button type="submit" className="fr-go" disabled={!v.trim()}>Create</button></div>
  </form>;
}

function Floating({ f, z, children, onFront, onClose, onDock }: { f: Float; z: number; children: ReactNode; onFront: () => void; onClose: () => void; onDock: () => void }) {
  const c = useDragControls();
  return <motion.section className="fr-float" style={{ left: f.x, top: f.y, zIndex: 60 + z }} aria-label="Floating note"
    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.14 } }} transition={PANEL}
    drag dragControls={c} dragListener={false} dragMomentum={false} dragElastic={0} onPointerDown={onFront}>
    <header className="fr-fh" onPointerDown={e => { if (!(e.target as HTMLElement).closest("button")) c.start(e); }}>
      <RiDragMove2Line className="fr-grip" aria-hidden />
      <span className="fr-fgrow" />
      <TooltipTrigger><IconButton size="small" icon={RiLayoutRightLine} aria-label="Dock back to the folder" onClick={onDock} /><Tooltip placement="bottom">Dock</Tooltip></TooltipTrigger>
      <CloseButton aria-label="Close note" onClick={onClose} />
    </header>
    <div className="fr-fb">{children}</div>
  </motion.section>;
}

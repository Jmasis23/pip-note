import { useEffect, useRef, useState } from "react";
import { RiArrowLeftSLine, RiPushpin2Fill, RiPushpin2Line } from "@remixicon/react";
import { IconButton } from "@/components/base/buttons/icon-button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Editor } from "./Editor";
import type { Note, Prefs } from "../domain";
import { repo } from "../useNotes";
import { isNative } from "../native";
import "./rail.css";

const blank = (n: Note) => !n.body.trim() && !n.checklist.length && /^(untitled)?$/i.test(n.title.trim());

/** The wiggle popup: the rail panel's note card, on a live note. The note exists from open and is removed on close if nothing was typed. */
export function PopupNote({ onClose }: { onClose: (kept: boolean) => void }) {
  const [note, setNote] = useState<Note | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const id = useRef<string>();
  const closing = useRef(false);

  const refresh = async () => {
    if (!id.current) return;
    const cur = await repo.get(id.current);
    if (cur.deletedAt !== null) { void close(); return; }
    setNote(cur);
    const [all, p] = await Promise.all([repo.list({ view: "all", query: "" }), repo.getPrefs()]);
    setPrefs(p); setFolders([...new Set([...all.map(n => n.folder ?? ""), ...(p.extraFolders ?? [])])].filter(Boolean).sort());
  };
  useEffect(() => {
    let dead = false;
    void (async () => {
      // Sweep blanks a crash may have left behind, then start a fresh note.
      const old = await repo.list({ view: "all", query: "" });
      for (const o of old) if (o.createdAt === o.updatedAt) { const full = await repo.get(o.id); if (blank(full)) { await repo.trash(o.id).catch(() => {}); await repo.deleteForever(o.id).catch(() => {}); } }
      const n = await repo.create({ title: "Untitled", body: "" });
      if (dead) { await repo.trash(n.id).catch(() => {}); await repo.deleteForever(n.id).catch(() => {}); return; }
      id.current = n.id; await refresh();
      setTimeout(() => document.querySelector<HTMLElement>(".fr-edit .rt-body")?.focus(), 60);
    })();
    return () => { dead = true; };
  }, []);

  const close = async () => {
    if (closing.current) return; closing.current = true;
    document.querySelector<HTMLElement>(".fr-edit .editor")?.blur();
    await new Promise(r => setTimeout(r, 120)); // let the editor flush its last keystrokes
    let kept = false;
    if (id.current) {
      const n = await repo.get(id.current).catch(() => null);
      if (n && n.deletedAt === null && !blank(n)) kept = true;
      else if (n) { if (n.deletedAt === null) await repo.trash(n.id).catch(() => {}); if (blank(n)) await repo.deleteForever(n.id).catch(() => {}); }
    }
    onClose(kept);
  };
  useEffect(() => { const f = () => void close(); window.addEventListener("pip-dismiss", f); return () => window.removeEventListener("pip-dismiss", f); });

  const folder = note?.folder || "Inbox";
  const pinned = !!note?.folder && !!prefs?.pinnedFolders?.includes(note.folder);
  const togglePin = () => { if (!note?.folder || !prefs) return; const p = prefs.pinnedFolders ?? []; void repo.setPrefs({ ...prefs, pinnedFolders: pinned ? p.filter(x => x !== note.folder) : [...p, note.folder!] }).then(refresh); };

  return (
    <section className="fr-panel pn" aria-label="Quick note"
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); void close(); } if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void close(); } }}>
      <header className="fr-head" data-tauri-drag-region>
        <IconButton size="small" icon={RiArrowLeftSLine} aria-label="Close note" onClick={() => void close()} />
        <div className="fr-title" data-tauri-drag-region><strong data-tauri-drag-region>{folder}</strong><small data-tauri-drag-region>Drag to move</small></div>
        {note?.folder && <IconButton size="small" icon={pinned ? RiPushpin2Fill : RiPushpin2Line} aria-label={pinned ? `Unpin ${folder}` : `Pin ${folder}`} aria-pressed={pinned} className={pinned ? "fr-pinned" : ""} onClick={togglePin} />}
        <CloseButton aria-label="Close" onClick={() => void close()} />
      </header>
      <div className="fr-edit">
        {note && <Editor key={note.id} note={blank(note) ? { ...note, title: "" } : note} folders={folders} color={prefs?.noteColors?.[note.id] ?? null}
          onColor={c => { if (!prefs) return; const m = { ...(prefs.noteColors ?? {}) }; if (c) m[note.id] = c; else delete m[note.id]; void repo.setPrefs({ ...prefs, noteColors: m }).then(refresh); }}
          onChanged={() => void refresh()} onBack={() => void close()} />}
      </div>
      {isNative() && document.documentElement.classList.contains("cap-win") && ([
        ["n", "North"], ["ne", "NorthEast"], ["e", "East"], ["se", "SouthEast"],
        ["s", "South"], ["sw", "SouthWest"], ["w", "West"], ["nw", "NorthWest"],
      ] as const).map(([edge, direction]) => <div key={edge} className={`capture-edge ${edge}`} aria-hidden="true" onMouseDown={e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().startResizeDragging(direction)).catch(() => {});
      }} />)}
    </section>
  );
}

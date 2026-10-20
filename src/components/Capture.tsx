import { isNative } from "../native";
import { captureModelEnabled, suggestCapture } from "../captureService";
import { capturedNote } from "../captureModel";
import { containModal } from "./modalFocus";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pip } from "./Pip";
import type { PipState } from "./Pip";
import { repo } from "../useNotes";
import { TextStepper } from "./TextStepper";
import type { TextSize } from "../domain";
import { imageFrom, imageNote, toDataUrl } from "../images";

export function Capture({ open, onClose, onSaved, variant = "modal", draftId, textSize, onTextSize, folder = "" }: { folder?: string; open: boolean; onClose: () => void; onSaved: () => void; variant?: "modal" | "island"; draftId?: string; textSize?: TextSize; onTextSize?: (v: TextSize) => void }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<PipState>("idle");
  const [status, setStatus] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [destination, setDestination] = useState(folder);
  const did = useRef<string | undefined>(undefined);
  const folderOverride = useRef(false);
  const [suggestedTitle, setSuggestedTitle] = useState("");
  const [suggestionStatus, setSuggestionStatus] = useState("");
  const [destinations, setDestinations] = useState<string[]>([]);
  useEffect(() => { if (!open) return; let dead = false; void Promise.all([repo.list({view:"all",query:""}), repo.getPrefs()]).then(([notes,prefs]) => { if (!dead) setDestinations([...new Set([folder, ...notes.map(n=>n.folder ?? ""), ...(prefs.extraFolders ?? [])])].filter(Boolean).sort()); }); return () => { dead = true; }; }, [open, folder]);

  useEffect(() => {
    if (!open) return;
    setState("capturing"); setStatus("");
    did.current = draftId; folderOverride.current = !!folder || !!draftId; setSuggestedTitle(""); setSuggestionStatus(""); setText(""); setDestination(folder);
    if (draftId) repo.listDrafts().then(l => { const d = l.find(x => x.id === draftId); if (d) { setText(d.text); setDestination(d.folder ?? ""); setStatus("Draft restored"); } }).catch(() => {});

  }, [open, draftId]);

  useEffect(() => {
    if (state === "saving" || state === "saved") return;
    setSuggestedTitle("");
    if (!open || !captureModelEnabled || text.trim().length < 3) return;
    let dead = false; const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSuggestionStatus("Choosing title and folder...");
      const timeout = window.setTimeout(() => controller.abort(), 2200);
      void suggestCapture({text, folders:destinations}, controller.signal).then(result => {
        if (dead) return;
        if (result?.titleConfident) setSuggestedTitle(result.title);
        if (result?.folderConfident && !folderOverride.current) setDestination(result.folder);
        setSuggestionStatus(result ? "Suggested by Jev. You can change the folder." : "Using the first line and current folder.");
      }).catch(() => { if (!dead) setSuggestionStatus("Using the first line and current folder."); }).finally(() => window.clearTimeout(timeout));
    }, 650);
    return () => { dead = true; window.clearTimeout(timer); controller.abort(); };
  }, [open, text, destinations, state]);

  useEffect(() => { if (!open || !dialog.current) return; return containModal(dialog.current, ref.current); }, [open]);

  const dismiss = async () => {
    if (state === "saving" || state === "saved") return;
    if (text.trim()) {
      try { await repo.saveDraft(text, did.current, destination); } catch { setState("error"); setStatus("Couldn't keep your draft. Your text is still here."); return; }
    } else if (did.current) await repo.deleteDraft(did.current).catch(() => {});
    onClose();
  };
  useEffect(() => { if (!open) return; const f = () => void dismiss(); window.addEventListener("pip-dismiss", f); return () => window.removeEventListener("pip-dismiss", f); });
  const pasteImage = async (e: React.ClipboardEvent) => {
    const img = imageFrom(e.clipboardData); if (!img || e.clipboardData.getData("text/plain")) return;
    e.preventDefault(); setState("saving"); setStatus("Saving image");
    try { await repo.create({ ...imageNote(await toDataUrl(img)), folder: destination }); setState("saved"); setStatus("Got it. Image saved."); onSaved(); setTimeout(() => { setText(""); onClose(); }, 750); }
    catch { setState("error"); setStatus("Couldn't save that image."); }
  };
  const keep = async () => {
    if (state === "saving" || state === "saved") return;
    if (!text.trim()) { setStatus("Write something first."); return; }
    setState("saving"); setStatus("Saving");
    try {
      const note = capturedNote(text, destination);
       // A selected later source span must not discard the original first line.
       if (suggestedTitle && suggestedTitle !== note.title?.trim()) { note.title = suggestedTitle; note.body = text; }
       await repo.create(note); if (did.current) await repo.deleteDraft(did.current);
      setState("saved"); setStatus("Got it. Saved."); onSaved();
      setTimeout(() => { setText(""); onClose(); }, 750);
    } catch { setState("error"); setStatus("Couldn't save. Your text is still here."); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) void dismiss(); }}>
          <motion.div ref={dialog} className={`capture ${variant}`} role="dialog" aria-modal="true" aria-label="Quick capture"
            initial={variant === "island" ? { width: 252, height: 44, borderRadius: 22 } : { y: 18, scale: 0.97, opacity: 0 }}
            animate={variant === "island" ? { width: 560, height: captureModelEnabled ? 270 : 250, borderRadius: 30 } : { y: 0, scale: 1, opacity: 1 }}
            exit={variant === "island" ? { width: 252, height: 44, borderRadius: 22, opacity: 0 } : { y: 10, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: variant === "island" ? 300 : 420, damping: variant === "island" ? 26 : 32 }}
            onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); void dismiss(); } if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void keep(); } }}>
            <header data-tauri-drag-region><Pip state={state} size={40} pulse={Math.floor(text.length / 6)} /><span data-tauri-drag-region>Something on your mind?</span>{textSize && onTextSize && <TextStepper value={textSize} onChange={onTextSize} />}<button type="button" className="capture-close" aria-label="Keep draft and close" title="Keep draft and close (Esc)" disabled={state === "saving" || state === "saved"} onClick={() => void dismiss()}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="m3 3 8 8M11 3l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button></header>
            <label className="capture-destination"><span>Keep in</span><select aria-label="Capture folder" value={destination} disabled={state === "saving" || state === "saved"} onChange={e => { folderOverride.current = true; setDestination(e.target.value); }}><option value="">Inbox (unfiled)</option>{[...new Set([...destinations, destination])].filter(Boolean).map(f=><option key={f} value={f}>{f}</option>)}</select></label>
            {captureModelEnabled && (suggestedTitle || text.trim()) && <div className="capture-arrangement"><p title={suggestedTitle || capturedNote(text).title || "First line of your note"}><b>{suggestedTitle || capturedNote(text).title || "First line of your note"}</b></p></div>}
            <textarea ref={ref} onPaste={e => void pasteImage(e)} value={text} disabled={state === "saving" || state === "saved"} onChange={e => { setText(e.target.value); if (state !== "capturing") setState("capturing"); setStatus(""); }} placeholder="Type it before it slips away" aria-label="Note text" />
            <footer>
              <span className={`status ${state === "error" ? "bad" : ""}`} role="status" aria-live="polite">{status || (text.trim() ? "Esc keeps a draft" : "Esc to close")}</span>
              <button className="primary" onClick={() => void keep()} disabled={state === "saving" || state === "saved"}>Keep it <kbd>Ctrl Enter</kbd></button>
            </footer>
            {isNative() && document.documentElement.classList.contains("cap-win") && ([
              ["n", "North"], ["ne", "NorthEast"], ["e", "East"], ["se", "SouthEast"],
              ["s", "South"], ["sw", "SouthWest"], ["w", "West"], ["nw", "NorthWest"],
            ] as const).map(([edge, direction]) => <div key={edge} className={`capture-edge ${edge}`} aria-hidden="true" onMouseDown={e => {
              if (e.button !== 0) return;
              e.preventDefault(); e.stopPropagation();
              void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().startResizeDragging(direction)).catch(() => setStatus("Couldn't resize. Try another edge."));
            }} />)}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

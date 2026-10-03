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

  useEffect(() => {
    if (!open) return;
    setState("capturing"); setStatus("");
    did.current = draftId; setText(""); setDestination(folder);
    if (draftId) repo.listDrafts().then(l => { const d = l.find(x => x.id === draftId); if (d) { setText(d.text); setDestination(d.folder ?? ""); setStatus("Draft restored"); } }).catch(() => {});
    
  }, [open, draftId]);

  useEffect(() => { if (!open || !dialog.current) return; return containModal(dialog.current, ref.current); }, [open]);

  const dismiss = async () => {
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
    if (!text.trim()) { setStatus("Write something first."); return; }
    setState("saving"); setStatus("Saving");
    try {
      await repo.create(capturedNote(text, destination)); if (did.current) await repo.deleteDraft(did.current);
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
            animate={variant === "island" ? { width: 560, height: 236, borderRadius: 30 } : { y: 0, scale: 1, opacity: 1 }}
            exit={variant === "island" ? { width: 252, height: 44, borderRadius: 22, opacity: 0 } : { y: 10, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: variant === "island" ? 300 : 420, damping: variant === "island" ? 26 : 32 }}
            onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); void dismiss(); } if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void keep(); } }}>
            <header><Pip state={state} size={46} /><span>Something on your mind?</span>{textSize && onTextSize && <TextStepper value={textSize} onChange={onTextSize} />}<kbd>Esc</kbd></header>
            <p className="capture-destination">Keep in <b>{destination || "Inbox (unfiled)"}</b></p>
            <textarea ref={ref} onPaste={e => void pasteImage(e)} value={text} disabled={state === "saving" || state === "saved"} onChange={e => { setText(e.target.value); if (state !== "capturing") setState("capturing"); setStatus(""); }} placeholder="Type it before it slips away" aria-label="Note text" />
            <footer>
              <span className={`status ${state === "error" ? "bad" : ""}`} role="status" aria-live="polite">{status || "Esc keeps a draft"}</span>
              <button className="primary" onClick={() => void keep()} disabled={state === "saving" || state === "saved"}>Keep it <kbd>Ctrl Enter</kbd></button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

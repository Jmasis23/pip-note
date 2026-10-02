import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pip } from "./Pip";
import type { PipState } from "./Pip";
import { repo } from "../useNotes";

export function Capture({ open, onClose, onSaved, variant = "modal" }: { open: boolean; onClose: () => void; onSaved: () => void; variant?: "modal" | "island" }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<PipState>("idle");
  const [status, setStatus] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setState("capturing"); setStatus("");
    repo.getDraft().then(d => { if (d) { setText(d.text); setStatus("Draft restored"); } else setText(""); }).catch(() => {});
    requestAnimationFrame(() => ref.current?.focus());
  }, [open]);

  const dismiss = async () => {
    if (text.trim()) {
      try { await repo.saveDraft(text); } catch { setState("error"); setStatus("Couldn't keep your draft. Your text is still here."); return; }
    } else await repo.clearDraft().catch(() => {});
    onClose();
  };
  const keep = async () => {
    if (!text.trim()) { setStatus("Write something first."); return; }
    setState("saving"); setStatus("Saving");
    try {
      await repo.create({ body: text }); await repo.clearDraft();
      setState("saved"); setStatus("Got it. Saved."); onSaved();
      setTimeout(() => { setText(""); onClose(); }, 750);
    } catch { setState("error"); setStatus("Couldn't save. Your text is still here."); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) void dismiss(); }}>
          <motion.div className={`capture ${variant}`} role="dialog" aria-modal="true" aria-label="Quick capture"
            initial={variant === "island" ? { width: 252, height: 44, borderRadius: 22 } : { y: 18, scale: 0.97, opacity: 0 }}
            animate={variant === "island" ? { width: 560, height: 236, borderRadius: 30 } : { y: 0, scale: 1, opacity: 1 }}
            exit={variant === "island" ? { width: 252, height: 44, borderRadius: 22, opacity: 0 } : { y: 10, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: variant === "island" ? 300 : 420, damping: variant === "island" ? 26 : 32 }}
            onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); void dismiss(); } if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void keep(); } }}>
            <header><Pip state={state} size={34} /><span>Something on your mind?</span><kbd>Esc</kbd></header>
            <textarea ref={ref} value={text} onChange={e => { setText(e.target.value); if (state !== "capturing") setState("capturing"); setStatus(""); }} placeholder="Type it before it slips away" aria-label="Note text" />
            <footer>
              <span className={`status ${state === "error" ? "bad" : ""}`} role="status" aria-live="polite">{status || "Esc keeps a draft"}</span>
              <button className="primary" onClick={() => void keep()} disabled={state === "saving"}>Keep it <kbd>Ctrl Enter</kbd></button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

export type Tone = "lav" | "mint" | "peach" | "white";
export const TONES: { id: Tone; label: string }[] = [{ id: "lav", label: "Lavender" }, { id: "mint", label: "Mint" }, { id: "peach", label: "Peach" }, { id: "white", label: "White" }];

/** One round swatch button. Click it and the card colors fan out above it. */
export function ColorPick({ value, onChange }: { value: Tone | null; onChange: (t: Tone | null) => void }) {
  const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null); const pop = useRef<HTMLDivElement>(null); const [at, setAt] = useState({ right: 0, bottom: 0 });
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key, true); };
  }, [open]);
  const pick = (t: Tone | null) => { onChange(t); setOpen(false); };
  return (
    <div className="cp" ref={box}>
      <button type="button" className={`cp-btn ${value ?? "auto"}`} aria-label="Card color" aria-haspopup="true" aria-expanded={open} title="Card color" onMouseDown={e => e.preventDefault()} onClick={() => { const r = box.current?.getBoundingClientRect(); if (r) setAt({ right: window.innerWidth - r.right, bottom: window.innerHeight - r.top + 10 }); setOpen(o => !o); }} />
      {createPortal(<AnimatePresence>{open && (
        <motion.div ref={pop} style={{ right: at.right, bottom: at.bottom }} className="cp-pop" role="group" aria-label="Card colors" initial={{ opacity: 0, y: 8, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.94 }} transition={{ type: "spring", stiffness: 520, damping: 34 }}>
          {TONES.map(t => <button key={t.id} type="button" className={`cp-sw ${t.id}`} aria-label={t.label} aria-pressed={value === t.id} title={t.label} onMouseDown={e => e.preventDefault()} onClick={() => pick(t.id)} />)}
          <button type="button" className="cp-sw auto" aria-label="Automatic" aria-pressed={value === null} title="Automatic" onMouseDown={e => e.preventDefault()} onClick={() => pick(null)} />
        </motion.div>)}
      </AnimatePresence>, document.querySelector(".db") ?? document.body)}
    </div>
  );
}

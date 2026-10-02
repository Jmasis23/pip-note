import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export type Opt = { value: string; label: string; hint?: string };

/** A styled listbox that follows the app theme. The native select and datalist popups ignore it. */
export function Dropdown({ value, options, onChange, label, placeholder = "Choose", footer, className = "" }: {
  value: string; options: Opt[]; onChange: (v: string) => void; label: string; placeholder?: string; footer?: (close: () => void) => ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const cur = options.find(o => o.value === value);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", on); return () => document.removeEventListener("mousedown", on);
  }, [open]);
  const pick = (v: string) => { onChange(v); setOpen(false); };
  return (
    <div className={`dd ${className}`} ref={root}>
      <button type="button" className="dd-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label} aria-controls={id}
        onClick={() => { setHi(Math.max(0, options.findIndex(o => o.value === value))); setOpen(o => !o); }}
        onKeyDown={e => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!open) { setOpen(true); return; } setHi(h => Math.min(options.length - 1, Math.max(0, h + (e.key === "ArrowDown" ? 1 : -1)))); }
          else if (e.key === "Enter" && open) { e.preventDefault(); e.stopPropagation(); if (options[hi]) pick(options[hi].value); }
          else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
        }}>
        <span className={cur ? "" : "dd-ph"}>{cur?.label ?? placeholder}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="dd-pop" id={id} role="listbox" aria-label={label}>
          {options.map((o, i) => (
            <button type="button" key={o.value} role="option" aria-selected={o.value === value} className={`dd-opt ${i === hi ? "hi" : ""}`} onMouseEnter={() => setHi(i)} onClick={() => pick(o.value)}>
              <span>{o.label}</span>{o.hint && <em>{o.hint}</em>}
              {o.value === value && <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 7.5l2.6 2.6L11 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </button>))}
          {footer && <div className="dd-foot">{footer(() => setOpen(false))}</div>}
        </div>)}
    </div>
  );
}

export function NewFolder({ onAdd }: { onAdd: (name: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="dd-new" onSubmit={e => { e.preventDefault(); if (v.trim()) { onAdd(v); setV(""); } }}>
      <input value={v} onChange={e => setV(e.target.value)} placeholder="New folder, or Work/Clients" aria-label="New folder name" maxLength={90} />
      <button type="submit" disabled={!v.trim()}>Add</button>
    </form>
  );
}

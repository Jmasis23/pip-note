import { useEffect, useRef, type ReactNode } from "react";
/** Shared modal frame for the nav panels. Escape closes, focus returns to the opener. */
export function Panel({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null; root.current?.focus();
    // Window-level so Escape still works after the focused button is removed (for example, Delete).
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); prev?.focus(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="db-veil" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="db-sheet panel" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={root}>
      <header className="panel-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div><button className="ghost" onClick={onClose}>Done</button></header>
      <div className="panel-body">{children}</div>
    </div>
  </div>;
}

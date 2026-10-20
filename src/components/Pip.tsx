import { useEffect, useRef } from "react";
import "./pip.css";
export type PipState = "idle" | "capturing" | "saving" | "saved" | "thinking" | "error";

// The brand: heavy rounded "Pip" and a three-stroke orange spark. Geometry is shared by the mark and the wordmark.
const SPARKS = [[379.9, 33.5, 372.4, 63.5], [400.4, 91.3, 424.6, 68.8], [417.5, 125, 442.5, 125]] as const;
const Sparks = () => <>{SPARKS.map(([x1, y1, x2, y2], i) => <line key={i} className={`s s${i + 1}`} x1={x1} y1={y1} x2={x2} y2={y2} />)}</>;

/** Restarts a one-shot CSS class on the svg: the attention bounce after `attn` ms, and a small flick every few keystrokes (`pulse`). */
function useCues(ref: React.RefObject<SVGSVGElement>, attn: number | undefined, pulse: number | undefined) {
  useEffect(() => {
    if (attn === undefined) return;
    const t = setTimeout(() => { const el = ref.current; if (el) { el.classList.remove("bounce"); void el.getBoundingClientRect(); el.classList.add("bounce"); } }, attn);
    return () => clearTimeout(t);
  }, [attn, ref]);
  useEffect(() => {
    const el = ref.current; if (!el || !pulse) return;
    el.classList.remove("flick"); void el.getBoundingClientRect(); el.classList.add("flick");
  }, [pulse, ref]);
}

/** The spark on its own: idle and hover, capturing (fires up), saved (burst), thinking (soft chase while busy), error (dimmed).
 *  `attn` plays one playful bounce after that many ms. `pulse` flicks the sparks when it changes. CSS only. */
export function Pip({ state = "idle", size = 56, still = false, attn, pulse }: { state?: PipState; size?: number; still?: boolean; look?: boolean; cyber?: boolean; attn?: number; pulse?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useCues(ref, attn, pulse);
  return (
    <svg ref={ref} key={state} className="pipm" data-state={state} data-still={still ? "" : undefined} viewBox="-68 -68 136 136" width={size} height={size} role="img" aria-label={`Pip is ${state}`}>
      <g transform="translate(-407 -79.5)"><Sparks /></g>
      <circle className="glow" r="64" />
    </svg>
  );
}

/** The wordmark: "Pip" with the spark. The spark fires once on load; hover nudges it. */
export function PipWord({ height = 40, attn, className = "" }: { height?: number; attn?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useCues(ref, attn, undefined);
  return (
    <svg ref={ref} className={`pipw ${className}`.trim()} data-state="idle" viewBox="14 8 450 282" height={height} width={height * 450 / 282} role="img" aria-label="Pip">
      <g className="ink" fillRule="evenodd">
        <path d="M36 56H117.5A62.5 62.5 0 0 1 117.5 181H76V222A8 8 0 0 1 68 230H36A8 8 0 0 1 28 222V64A8 8 0 0 1 36 56ZM76 97H107A21 21 0 0 1 107 139H76Z" />
        <path d="M199 101H227A9 9 0 0 1 236 110V221A9 9 0 0 1 227 230H199A9 9 0 0 1 190 221V110A9 9 0 0 1 199 101Z" />
        <circle cx="213.5" cy="61.5" r="27.5" />
        <path d="M257 98H316A68 68 0 1 1 290 228.3V274A9 9 0 0 1 281 283H257A9 9 0 0 1 248 274V107A9 9 0 0 1 257 98ZM339 166.5A24 24 0 1 0 291 166.5A24 24 0 1 0 339 166.5Z" />
      </g>
      <Sparks />
    </svg>
  );
}

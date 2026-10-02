import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
export type PipState = "idle" | "capturing" | "saving" | "saved" | "thinking" | "error";

const INK = "#2D2D31";
const SPARK: Record<string, string> = { idle: "#FFC78B", capturing: "#FFB3C6", saving: "#FFB3C6", saved: "#8CBBF5", thinking: "#8CBBF5", error: "#FFC78B" };

/** Pip, the note buddy: a cream sticky note with a pushpin, a folded corner and a face that changes with the moment. */
export function Pip({ state = "idle", size = 56, still = false, look = false }: { state?: PipState; size?: number; still?: boolean; look?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [eye, setEye] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!look || still) return;
    const on = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect(); if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 160);
      setEye({ x: (dx / d) * 1.8 * k, y: (dy / d) * 1.8 * k });
    };
    window.addEventListener("pointermove", on, { passive: true }); return () => window.removeEventListener("pointermove", on);
  }, [look, still]);
  const anim =
    still ? {} :
    state === "saved" ? { rotate: [0, 6, -3, 0], y: [0, -4, 0, 0] } :
    state === "saving" ? { rotate: [0, -4, 4, -4, 0] } :
    state === "thinking" ? { rotate: [-2, 2, -2], y: [0, -1.500, 0] } :
    state === "error" ? { rotate: [0, -6], y: 1 } :
    state === "capturing" ? { rotate: -3, y: [0, -2, 0] } : { rotate: 0 };
  const loop = !still && (state === "saving" || state === "thinking");
  const sp = SPARK[state] ?? SPARK.idle;
  const happy = state === "capturing" || state === "saving";
  const face = (() => {
    if (state === "saved") return <g fill="none" stroke={INK} strokeWidth="2.200" strokeLinecap="round"><path d="M18 33q3.500-4 7 0M33 33q3.500-4 7 0" /><path d="M24 40q5 4.500 10 0" /></g>;
    if (happy) return <g fill="none" stroke={INK} strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round"><path d="M18 30l6 3-6 3M40 30l-6 3 6 3" /><path d="M24 40q5 6 10 0z" fill={INK} /></g>;
    if (state === "thinking") return <g><g fill={INK} style={{ transform: `translate(${eye.x}px, ${eye.y}px)`, transition: "transform .12s ease-out" }}><ellipse cx="22" cy="33" rx="2.200" ry="3" /><ellipse cx="37" cy="33" rx="2.200" ry="3" /></g><path d="M25 41.500h7" stroke={INK} strokeWidth="2.200" strokeLinecap="round" fill="none" /></g>;
    if (state === "error") return <g><g fill={INK}><ellipse cx="22" cy="34" rx="2.200" ry="3" /><ellipse cx="37" cy="34" rx="2.200" ry="3" /></g><path d="M25 43q4-3 8 0" stroke={INK} strokeWidth="2.200" strokeLinecap="round" fill="none" /></g>;
    return <g><g className={!still ? "pip-blink" : undefined} fill={INK} style={{ transform: `translate(${eye.x}px, ${eye.y}px)`, transition: "transform .12s ease-out" }}><ellipse cx="22" cy="33" rx="2.200" ry="3.200" />
      <path d="M33.500 33q3.500-4.500 7 0" stroke={INK} strokeWidth="2.200" fill="none" strokeLinecap="round" /></g><path d="M25 40q4.500 4 9 0" stroke={INK} strokeWidth="2.200" strokeLinecap="round" fill="none" /></g>;
  })();
  return (
    <motion.svg ref={ref} viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={`Pip is ${state}`}
      animate={anim} transition={{ duration: loop ? 1.2 : 0.5, ease: "easeInOut", repeat: loop ? Infinity : 0 }}
      style={{ overflow: "visible", transformOrigin: "50% 85%" }}>
      <defs>
        <linearGradient id="pipBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFFDF9" /><stop offset="1" stopColor="#FFEFD6" /></linearGradient>
        <linearGradient id="pipPin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9AA3B2" /><stop offset="1" stopColor="#626B7A" /></linearGradient>
      </defs>
      <ellipse cx="33" cy="60" rx="18" ry="2.500" fill="rgba(45,45,49,.12)" />
      <ellipse cx="9" cy="43" rx="5" ry="6.500" fill="#FFF6E8" stroke="#D8C6A8" strokeWidth="1.400" />
      <path d="M20 12h24c6 0 10 4 10 10v22c0 3-1 5-3 7l-9 9c-2 2-4 3-7 3H20c-6 0-10-4-10-10V22c0-6 4-10 10-10z" fill="url(#pipBody)" stroke="#D8C6A8" strokeWidth="1.600" strokeLinejoin="round" />
      <path d="M54 44c-2 2-4 3-8 3-2 0-3 1-3 3 0 4-1 7-3 9 3 0 5-1 7-3l7-8c1-1 1-3 0-4z" fill="#FFE2BC" stroke="#E0B97F" strokeWidth="1.400" strokeLinejoin="round" />
      <circle cx="16" cy="40" r="3.200" fill="#FFB8C8" opacity=".75" /><circle cx="43" cy="40" r="3.200" fill="#FFB8C8" opacity=".75" />
      {face}
      <path d="M32 10v5" stroke="#5A6272" strokeWidth="2" strokeLinecap="round" />
      <path d="M25 4.500q0-3 3-3h8q3 0 3 3l-1.500 6h-11z" fill="url(#pipPin)" stroke="#555D6C" strokeWidth="1.200" strokeLinejoin="round" />
      <rect x="22" y="9" width="20" height="4.500" rx="2.200" fill="url(#pipPin)" stroke="#555D6C" strokeWidth="1.200" />
      {state === "thinking" ? <text x="55" y="9" fontSize="14" fontWeight="800" fill={sp} fontFamily="Inter Variable, system-ui">?</text> :
        <g stroke={sp} strokeWidth="2.600" strokeLinecap="round"><path d="M53 4l3-3M57 10h4M50 0l1-3" transform="translate(0 3)" /></g>}
    </motion.svg>
  );
}

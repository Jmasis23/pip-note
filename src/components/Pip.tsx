import { useEffect, useRef } from "react";
import { PIP_ART, PIP_DEFS } from "./pipArt";
import { PIP_CYBER } from "./pipCyber";
import "./pipArt.css";
export type PipState = "idle" | "capturing" | "saving" | "saved" | "thinking" | "error";

const ART = { idle: "idle", capturing: "capture", saving: "capture", saved: "saved", thinking: "thinking", error: "thinking" } as const;

/** Pip, the note buddy. Animated brand SVG: idle, capture, saved and thinking each have their own motion (CSS, no library). */
export function Pip({ state = "idle", size = 56, still = false, look = false, cyber = false }: { state?: PipState; size?: number; still?: boolean; look?: boolean; cyber?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!look || still || state !== "idle") return;
    const on = (e: PointerEvent) => {
      const el = ref.current; if (!el) return; const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 160);
      el.style.setProperty("--ex", `${(dx / d) * 14 * k}px`); el.style.setProperty("--ey", `${(dy / d) * 9 * k}px`);
    };
    window.addEventListener("pointermove", on, { passive: true }); return () => window.removeEventListener("pointermove", on);
  }, [look, still, state]);
  return (
    <svg ref={ref} className={cyber ? "pipx cyber" : "pipx"} data-s={ART[state]} data-state={state} data-still={still ? "" : undefined} data-look={look && state === "idle" ? "" : undefined}
      viewBox="-10 -90 800 816" width={size} height={size * 816 / 800} role="img" aria-label={`Pip is ${state}`}
      dangerouslySetInnerHTML={{ __html: PIP_DEFS + PIP_ART[ART[state]] + (cyber ? PIP_CYBER : "") }} />
  );
}

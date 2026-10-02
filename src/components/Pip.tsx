import { motion } from "motion/react";
export type PipState = "idle" | "capturing" | "saving" | "saved" | "error";

/** Original arrow-cursor mascot: asymmetric rounded body, two eyes, folded tail. */
export function Pip({ state = "idle", size = 56, still = false }: { state?: PipState; size?: number; still?: boolean }) {
  const anim =
    still ? {} :
    state === "saved" ? { rotate: [0, 8, -4, 0], y: [0, 3, 0, 0] } :
    state === "saving" ? { rotate: [0, -5, 5, -5, 0] } :
    state === "error" ? { rotate: [0, -10], y: 2 } :
    state === "capturing" ? { rotate: -4 } : { rotate: 0 };
  const eyeY = state === "error" ? 30 : 27;
  return (
    <motion.svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={`Pip is ${state}`}
      animate={anim} transition={{ duration: state === "saving" ? 0.7 : 0.45, ease: "easeOut", repeat: state === "saving" && !still ? Infinity : 0 }}
      style={{ overflow: "visible", transformOrigin: "30% 80%" }}>
      <path d="M14 8c-2-1-5 1-4.500 4l7 38c.6 3.200 4.500 4 6.200 1.200l5.300-8.400 9.800 6.600c2 1.300 4.600.4 5.300-1.800l1-3c.6-1.800-.2-3.700-1.800-4.700l-9.500-5.800 9.200-2c3-.7 3.800-4.500 1.200-6.200z"
        fill="var(--lav)" stroke="var(--ink-fixed)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M40 46l5 3.400" stroke="var(--ink-fixed)" strokeWidth="2.400" strokeLinecap="round" opacity=".35" />
      <g className={state === "idle" && !still ? "pip-blink" : undefined} fill="var(--ink-fixed)">
        <circle cx="21" cy={eyeY} r="2.300" /><circle cx="29.500" cy={eyeY + 2} r="2.300" />
      </g>
      {state === "saved" && <path d="M20 37q4.500 4 9 1" stroke="var(--ink-fixed)" strokeWidth="2" fill="none" strokeLinecap="round" />}
      {state === "error" && <path d="M20 40q4.500-3 9-1" stroke="var(--ink-fixed)" strokeWidth="2" fill="none" strokeLinecap="round" />}
    </motion.svg>
  );
}

/** Mouse-shake recognizer. A shake is quick left-right (or up-down) back and forth with the button up. */
export type ShakeOpts = { windowMs: number; minSwing: number; reversals: number; minSpeed: number };
export const DEFAULT_SHAKE: ShakeOpts = { windowMs: 700, minSwing: 40, reversals: 4, minSpeed: 0.6 };

export type ShakeLevel = "gentle" | "normal" | "eager";
/** Same numbers live in src-tauri/core/src/gesture.rs. Keep both in step. */
export const SHAKE_LEVELS: Record<ShakeLevel, ShakeOpts> = {
  gentle: { windowMs: 800, minSwing: 60, reversals: 5, minSpeed: 0.8 },
  normal: DEFAULT_SHAKE,
  eager: { windowMs: 700, minSwing: 24, reversals: 3, minSpeed: 0.35 },
};

type Pt = { x: number; y: number; t: number };

export function createShakeDetector(onShake: () => void, opts: ShakeOpts = DEFAULT_SHAKE, cooldownMs = 1200) {
  let pts: Pt[] = [];
  let lastFire = -Infinity;
  const axisReversals = (get: (p: Pt) => number) => {
    // Walk the path, count direction flips that follow at least minSwing px of travel.
    let dir = 0, anchor = get(pts[0]), flips = 0, dist = 0;
    for (const p of pts) {
      const v = get(p), d = v - anchor;
      if (Math.abs(d) >= opts.minSwing / 2) {
        const nd = Math.sign(d);
        if (dir !== 0 && nd !== dir) flips++;
        dir = nd; dist += Math.abs(d); anchor = v;
      } else if (dir !== 0 && Math.sign(v - anchor) === -dir && Math.abs(v - anchor) >= opts.minSwing / 2) { anchor = v; }
    }
    return { flips, dist };
  };
  return {
    move(x: number, y: number, t: number, buttons = 0) {
      if (buttons !== 0) { pts = []; return false; }
      pts.push({ x, y, t });
      while (pts.length && t - pts[0].t > opts.windowMs) pts.shift();
      if (pts.length < 6 || t - lastFire < cooldownMs) return false;
      for (const get of [(p: Pt) => p.x, (p: Pt) => p.y]) {
        const { flips, dist } = axisReversals(get);
        const span = pts[pts.length - 1].t - pts[0].t || 1;
        if (flips >= opts.reversals && dist / span >= opts.minSpeed) { lastFire = t; pts = []; onShake(); return true; }
      }
      return false;
    },
    reset() { pts = []; },
  };
}

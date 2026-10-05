/** Landmark model, mirrored from src-tauri/core/src/landmarks.rs. Rust validates on save in the desktop app;
 *  this copy drives the editor (live conflict messages) and the in-window gesture test. Keep both in step. */
export type Tool =
  | "quick-capture"
  | "quick-recall"
  | "clipboard-shelf"
  | "snippets"
  | "project-shelf"
  | "floating-reference"
  | "follow-ups"
  | "resume-cards"
  | "utilities"
  | "favorites";
export type Rect = { x: number; y: number; w: number; h: number };
export type Monitor = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
};
export type Landmark = {
  id: string;
  name: string;
  enabled: boolean;
  monitor_id: string;
  rect: Rect;
  tool: Tool;
  project?: string;
  needs_review?: boolean;
};
export type Layout = { monitors: Monitor[]; landmarks: Landmark[] };

export const TOOLS: { id: Tool; label: string; ready: boolean }[] = [
  { id: "quick-capture", label: "Quick Capture", ready: true },
  { id: "quick-recall", label: "Quick Recall", ready: true },
  { id: "clipboard-shelf", label: "Clipboard Shelf", ready: true },
  { id: "snippets", label: "Snippets", ready: true },
  { id: "project-shelf", label: "Project Shelf", ready: true },
  { id: "floating-reference", label: "Floating Reference", ready: true },
  { id: "follow-ups", label: "Follow-ups", ready: true },
  { id: "resume-cards", label: "Resume Cards", ready: true },
  { id: "utilities", label: "Quick Utilities", ready: true },
  { id: "favorites", label: "Favorites menu", ready: true },
];
export const toolLabel = (t: Tool) => TOOLS.find((x) => x.id === t)?.label ?? t;
export const MIN_SIDE = 0.03;
export const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** First problem found, as a sentence for the user, or null. Disabled Landmarks still count. */
export function validate(all: Landmark[]): string | null {
  for (let i = 0; i < all.length; i++) {
    const l = all[i],
      r = l.rect,
      eps = 1e-9;
    if (!l.name.trim()) return "Give every Landmark a name.";
    if (!(
      r.x >= -eps &&
      r.y >= -eps &&
      r.w > 0 &&
      r.h > 0 &&
      r.x + r.w <= 1 + eps &&
      r.y + r.h <= 1 + eps
    ))
      return `"${l.name}" is outside its monitor. Keep the region inside the screen.`;
    if (r.w < MIN_SIDE || r.h < MIN_SIDE)
      return `"${l.name}" is too small to wiggle in. Make it at least 3% of the screen wide and tall.`;
    for (const o of all.slice(0, i)) {
      if (o.id === l.id) return `Two Landmarks share the id ${l.id}.`;
      if (o.monitor_id === l.monitor_id && overlaps(o.rect, r))
        return `"${l.name}" overlaps "${o.name}". Landmarks can't overlap, because Pip would not know which tool you meant. Move or resize one of them.`;
    }
  }
  return null;
}
export function defaultPresets(monitorId: string): Landmark[] {
  const mk = (
    slot: string,
    name: string,
    tool: Tool,
    x: number,
    y: number,
    w: number,
    h: number,
  ): Landmark => ({
    id: `preset-${monitorId}-${slot}`,
    name,
    enabled: true,
    monitor_id: monitorId,
    rect: { x, y, w, h },
    tool,
  });
  return [
    mk("top-right", "Top right", "quick-capture", 0.88, 0, 0.12, 0.16),
    mk("left-edge", "Left edge", "clipboard-shelf", 0, 0.3, 0.05, 0.4),
    mk("bottom-right", "Bottom right", "project-shelf", 0.88, 0.84, 0.12, 0.16),
    mk("top-left", "Top left", "quick-recall", 0, 0, 0.12, 0.16),
  ];
}
export const EDGE_PRESETS: { slot: string; name: string; rect: Rect }[] = [
  {
    slot: "top-left",
    name: "Top left",
    rect: { x: 0, y: 0, w: 0.12, h: 0.16 },
  },
  {
    slot: "top-right",
    name: "Top right",
    rect: { x: 0.88, y: 0, w: 0.12, h: 0.16 },
  },
  {
    slot: "bottom-left",
    name: "Bottom left",
    rect: { x: 0, y: 0.84, w: 0.12, h: 0.16 },
  },
  {
    slot: "bottom-right",
    name: "Bottom right",
    rect: { x: 0.88, y: 0.84, w: 0.12, h: 0.16 },
  },
  {
    slot: "left-edge",
    name: "Left edge",
    rect: { x: 0, y: 0.3, w: 0.05, h: 0.4 },
  },
  {
    slot: "right-edge",
    name: "Right edge",
    rect: { x: 0.95, y: 0.3, w: 0.05, h: 0.4 },
  },
  {
    slot: "top-edge",
    name: "Top edge",
    rect: { x: 0.3, y: 0, w: 0.4, h: 0.06 },
  },
  {
    slot: "bottom-edge",
    name: "Bottom edge",
    rect: { x: 0.3, y: 0.94, w: 0.4, h: 0.06 },
  },
];
export const clampRect = (r: Rect): Rect => {
  const w = Math.min(1, Math.max(MIN_SIDE, r.w)),
    h = Math.min(1, Math.max(MIN_SIDE, r.h));
  return {
    x: Math.min(1 - w, Math.max(0, r.x)),
    y: Math.min(1 - h, Math.max(0, r.y)),
    w,
    h,
  };
};
/** Flag Landmarks whose monitor vanished or changed shape. Same-shape resolution changes stay valid. */
export function reconcile(
  layout: Layout,
  now: Monitor[],
): { layout: Layout; flagged: string[] } {
  const flagged: string[] = [];
  const landmarks = layout.landmarks.map((l) => {
    const b = layout.monitors.find((m) => m.id === l.monitor_id),
      a = now.find((m) => m.id === l.monitor_id);
    const bad =
      !a ||
      (!!b &&
        (Math.abs(b.w / b.h / (a.w / a.h) - 1) > 0.02 ||
          b.x !== a.x ||
          b.y !== a.y ||
          b.scale !== a.scale));
    if (bad && !l.needs_review) {
      flagged.push(l.id);
      return { ...l, needs_review: true };
    }
    return l;
  });
  return { layout: { monitors: now, landmarks }, flagged };
}

// ---- in-window gesture test (the background listener is Rust) ----
export type GestureOpts = {
  minTravel: number;
  reversals: number;
  windowMs: number;
  tolerance: number;
  cooldownMs: number;
};
export const DEFAULT_OPTS: GestureOpts = {
  minTravel: 36,
  reversals: 4,
  windowMs: 800,
  tolerance: 24,
  cooldownMs: 1200,
};
const l3 = (a: number, b: number, c: number, t: number) =>
  t <= 0.5 ? a + (b - a) * (t / 0.5) : b + (c - b) * ((t - 0.5) / 0.5);
export function optsFromSensitivity(s: number): GestureOpts {
  const t = Math.min(100, Math.max(0, s)) / 100;
  return {
    ...DEFAULT_OPTS,
    minTravel: l3(60, 36, 22, t),
    reversals: Math.round(l3(5, 4, 3, t)),
    windowMs: l3(900, 800, 800, t),
  };
}
type Pt = { x: number; y: number; t: number };
export function countReversals(
  pts: Pt[],
  get: (p: Pt) => number,
  min: number,
): number {
  const first = get(pts[0]);
  let lo = first,
    hi = first,
    loI = 0,
    hiI = 0,
    dir = 0,
    ext = first,
    flips = 0;
  pts.forEach((p, i) => {
    const v = get(p);
    if (dir === 0) {
      if (v < lo) {
        lo = v;
        loI = i;
      }
      if (v > hi) {
        hi = v;
        hiI = i;
      }
      if (hi - lo >= min) {
        dir = hiI > loI ? 1 : -1;
        ext = dir > 0 ? hi : lo;
      }
    } else if (dir === 1) {
      if (v > ext) ext = v;
      else if (ext - v >= min) {
        flips++;
        dir = -1;
        ext = v;
      }
    } else {
      if (v < ext) ext = v;
      else if (v - ext >= min) {
        flips++;
        dir = 1;
        ext = v;
      }
    }
  });
  return flips;
}
type R4 = [number, number, number, number];
export function createWiggleTest(
  rects: () => { id: string; r: R4 }[],
  opts: () => GestureOpts,
  onFire: (id: string) => void,
  restMs = 350,
) {
  type S =
    | { kind: "idle" }
    | { kind: "cand"; id: string; r: R4; pts: Pt[] }
    | { kind: "spent"; r: R4; last: number };
  let s: S = { kind: "idle" },
    cooldownUntil = -Infinity,
    lastT = -Infinity;
  const inside = (r: number[], x: number, y: number, pad: number) =>
    x >= r[0] - pad &&
    y >= r[1] - pad &&
    x < r[0] + r[2] + pad &&
    y < r[1] + r[3] + pad;
  return {
    reset() {
      s = { kind: "idle" };
    },
    /** 0 to 1: how close the current candidate is to firing. Reversals only, so hovering and single sweeps read 0. */
    progress(): number {
      if (s.kind !== "cand") return 0;
      const o = opts();
      return Math.min(
        1,
        Math.max(
          countReversals(s.pts, (p) => p.x, o.minTravel),
          countReversals(s.pts, (p) => p.y, o.minTravel),
        ) / Math.max(1, o.reversals),
      );
    },
    move(x: number, y: number, t: number, buttonDown = false): string | null {
      const o = opts(),
        gap = t - lastT;
      lastT = t;
      if (buttonDown) {
        s = { kind: "idle" };
        return null;
      }
      if (s.kind === "spent") {
        const rested = t - s.last >= restMs || gap >= restMs;
        const left = !inside(s.r, x, y, o.tolerance);
        s.last = t;
        if (rested || left) s = { kind: "idle" };
        else return null;
      }
      if (s.kind === "idle") {
        const h = rects().find((c) => inside(c.r, x, y, 0));
        if (h) s = { kind: "cand", id: h.id, r: h.r, pts: [{ x, y, t }] };
        return null;
      }
      if (!inside(s.r, x, y, o.tolerance)) {
        s = { kind: "idle" };
        return null;
      }
      s.pts.push({ x, y, t });
      while (s.pts.length && t - s.pts[0].t > o.windowMs) s.pts.shift();
      if (t < cooldownUntil || s.pts.length < 4) return null;
      if (
        countReversals(s.pts, (p) => p.x, o.minTravel) >= o.reversals ||
        countReversals(s.pts, (p) => p.y, o.minTravel) >= o.reversals
      ) {
        const id = s.id;
        cooldownUntil = t + o.cooldownMs;
        s = { kind: "spent", r: s.r, last: t };
        onFire(id);
        return id;
      }
      return null;
    },
  };
}

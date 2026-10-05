import { call, isNative } from "../native";
import {
  defaultPresets,
  reconcile,
  validate,
  type Landmark,
  type Layout,
  type Monitor,
} from "./model";
export type LandmarkState = {
  layout: Layout;
  status: string;
  paused: boolean;
  preview: boolean;
  sensitivity?: number;
  shortcut_errors?: string[];
};
/** Browser preview has no listener: two sample monitors (one at a negative desktop position) and localStorage. The desktop app uses Rust. */
const PREVIEW_KEY = "pip.landmarks.preview.v1";
const PREVIEW_MONITORS: Monitor[] = [
  { id: "Display 1", x: 0, y: 0, w: 1920, h: 1080, scale: 1 },
  { id: "Display 2", x: -2560, y: -180, w: 2560, h: 1440, scale: 1.25 },
];
const previewDefault = (): Layout => ({
  monitors: PREVIEW_MONITORS,
  landmarks: [
    ...defaultPresets("Display 1"),
    ...defaultPresets("Display 2").slice(0, 1),
  ],
});
export async function loadLandmarks(): Promise<LandmarkState> {
  if (isNative()) {
    const s = await call<Omit<LandmarkState, "preview">>("landmarks_get");
    return { ...s, preview: false };
  }
  let layout = previewDefault();
  try {
    const raw = localStorage.getItem(PREVIEW_KEY);
    if (raw)
      layout = reconcile(JSON.parse(raw) as Layout, PREVIEW_MONITORS).layout;
  } catch {
    /* corrupt preview data: presets */
  }
  return { layout, status: "preview", paused: false, preview: true };
}
/** Resolves only after the write succeeded. Rejects with a sentence meant for the user. */
export async function saveLandmarks(
  landmarks: Landmark[],
  reviewed: string[] = [],
  expected: Landmark[] | null = null,
): Promise<Layout> {
  const problem = validate(landmarks);
  if (problem) throw new Error(problem);
  if (isNative())
    return call<Layout>("landmarks_save", {
      landmarks,
      reviewed,
      expected,
    }).catch((e) => {
      throw new Error(String(e));
    });
  const cur = await loadLandmarks();
  const next = { ...cur.layout, landmarks };
  try {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(next));
  } catch {
    throw new Error("Couldn't save: browser storage is full or blocked.");
  }
  return next;
}
export async function resetLandmarks(): Promise<Layout> {
  if (isNative())
    return call<Layout>("landmarks_reset").catch((e) => {
      throw new Error(String(e));
    });
  const cur = await loadLandmarks();
  return saveLandmarks(
    cur.layout.monitors.flatMap((m) => defaultPresets(m.id)),
  );
}

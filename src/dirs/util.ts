import { useEffect, useMemo, useState } from "react";
import { createShakeDetector, SHAKE_LEVELS } from "../gesture";
import { repo } from "../useNotes";
import type { Note, Prefs } from "../domain";
import { isNative } from "../native";

export const when = (t: number) => {
  const d = new Date(t), n = new Date();
  return d.toDateString() === n.toDateString() ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};
export const dayLabel = (t: number) => {
  const d = new Date(t), n = new Date(), y = new Date(Date.now() - 864e5);
  return d.toDateString() === n.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
};
export const preview = (n: Note) => (n.body.replace(/\s+/g, " ").trim() || n.checklist.map(c => c.text).join(", ")).slice(0, 140);

/** Shake + hotkey triggers shared by every direction. */
export function useTriggers(prefs: Prefs, trigger: () => void, paused: boolean) {
  const native = isNative(); // the desktop app owns shake and hotkey system-wide in Rust
  useEffect(() => {
    if (native || !prefs.shakeToCapture || paused) return;
    const det = createShakeDetector(trigger, SHAKE_LEVELS[prefs.shakeLevel ?? "normal"]);
    const on = (e: PointerEvent) => { if (e.pointerType === "mouse") det.move(e.clientX, e.clientY, e.timeStamp, e.buttons); };
    window.addEventListener("pointermove", on, { passive: true }); return () => window.removeEventListener("pointermove", on);
  }, [prefs.shakeToCapture, prefs.shakeLevel, paused]);
  useEffect(() => {
    if (native) return;
    const parts = prefs.shortcut.split("+"), key = parts[parts.length - 1];
    const on = (e: KeyboardEvent) => {
      const k = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (k === key && e.ctrlKey === parts.includes("Ctrl") && e.shiftKey === parts.includes("Shift") && e.altKey === parts.includes("Alt")) { e.preventDefault(); trigger(); }
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  }, [prefs.shortcut]);
}
export function useFull(selId: string | null, notes: Note[]) {
  const [full, setFull] = useState<Note | null>(null);
  useEffect(() => { if (!selId) { setFull(null); return; } repo.get(selId).then(setFull).catch(() => setFull(null)); }, [selId, notes]);
  return useMemo(() => (full && full.id === selId ? full : null), [full, selId]);
}

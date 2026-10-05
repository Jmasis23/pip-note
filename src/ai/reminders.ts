import { kv, isNative, onNativeEvent } from "../native";

export type Reminder = { id: string; text: string; at: number; noteId?: string };
const KEY = "pip.reminders"; // read by the app's background clock (it sends the notification)
const FIRED = "pip.reminders.seen";

export function loadReminders(): Reminder[] {
  try { const v = JSON.parse(kv.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((r: Reminder) => r && typeof r.id === "string" && typeof r.at === "number" && typeof r.text === "string") : []; } catch { return []; }
}
const save = (l: Reminder[]) => { kv.setItem(KEY, JSON.stringify(l.slice(-200))); window.dispatchEvent(new Event("pip:reminders")); };
export function addReminder(r: Omit<Reminder, "id">): Reminder { const n = { ...r, id: crypto.randomUUID() }; save([...loadReminders(), n]); return n; }
export function removeReminder(id: string) { save(loadReminders().filter(r => r.id !== id)); }
export function snooze(id: string, ms: number) { save(loadReminders().map(r => r.id === id ? { ...r, at: Date.now() + ms } : r)); }

/** Upcoming first, then ones that already went off and wait to be cleared. */
export function split(list: Reminder[], now: number) {
  const up = list.filter(r => r.at > now).sort((a, b) => a.at - b.at);
  const due = list.filter(r => r.at <= now).sort((a, b) => b.at - a.at);
  return { up, due };
}
export function onRemindersChanged(cb: () => void): () => void {
  window.addEventListener("pip:reminders", cb);
  let off = () => {};
  if (isNative()) void onNativeEvent("reminder-fired", cb).then(f => { off = f; });
  return () => { window.removeEventListener("pip:reminders", cb); off(); };
}

/** Browser preview has no background clock, so ring from here while a tab is open. */
export function previewRing(onRing: (r: Reminder) => void): () => void {
  if (isNative()) return () => {};
  const t = window.setInterval(() => { const seen: string[] = JSON.parse(kv.getItem(FIRED) ?? "[]"); const now = Date.now(); const hit = loadReminders().filter(r => r.at <= now && !seen.includes(r.id)); if (hit.length) { kv.setItem(FIRED, JSON.stringify([...seen, ...hit.map(h => h.id)].slice(-200))); hit.forEach(onRing); } }, 5000);
  return () => window.clearInterval(t);
}

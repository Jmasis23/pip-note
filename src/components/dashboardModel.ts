import type { Note } from "../domain";

/** Use the account's display name, never turn an email address into a greeting. */
export function greeting(name?: string): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hi, ${first}` : "Hi there";
}

const localDay = (timestamp: number) => new Date(timestamp).toDateString();

export function dashboardModel(notes: Note[], now: number) {
  const active = notes.filter(note => note.deletedAt === null);
  const recent = [...active].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  const unfinished = recent.filter(note => note.checklist.some(item => !item.done));
  return {
    total: active.length,
    today: active.filter(note => localDay(note.createdAt) === localDay(now) || localDay(note.updatedAt) === localDay(now)).length,
    openItems: active.reduce((sum, note) => sum + note.checklist.filter(item => !item.done).length, 0),
    pinned: recent.filter(note => note.pinned).slice(0, 3),
    recent: recent.slice(0, 4),
    unfinished: unfinished.slice(0, 3),
  };
}

import type { Note } from "../domain";
import type { Snippet } from "./store";
export type RecallItem = { id: string; kind: "note" | "snippet"; title: string; text: string };
const MAX = 8;
/** Quick Recall: snippets first when the name matches, then notes, newest first. An empty query shows the most recent. */
export function recallResults(notes: Note[], snippets: Snippet[], query: string): RecallItem[] {
  const q = query.trim().toLowerCase();
  const live = notes.filter(n => n.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt);
  const n = live.filter(x => !q || (x.title + " " + x.body).toLowerCase().includes(q)).map<RecallItem>(x => ({ id: x.id, kind: "note", title: x.title || x.body.split("\n")[0].slice(0, 60) || "Untitled", text: x.body }));
  const s = [...snippets].sort((a, b) => b.updatedAt - a.updatedAt).filter(x => !q || (x.name + " " + x.text).toLowerCase().includes(q)).map<RecallItem>(x => ({ id: x.id, kind: "snippet", title: x.name, text: x.text }));
  const named = s.filter(x => q && x.title.toLowerCase().includes(q)); const rest = s.filter(x => !named.includes(x));
  return [...named, ...n, ...rest].slice(0, MAX);
}

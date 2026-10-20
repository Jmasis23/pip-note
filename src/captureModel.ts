import type { NoteInput } from "./domain";
/** First line is the title; remaining lines are the body. No captured words discarded. */
export function capturedNote(text: string, folder = ""): NoteInput {
  const firstBreak = text.indexOf("\n");
  const title = firstBreak < 0 ? text : text.slice(0, firstBreak);
  return title.trim() ? { title, body: firstBreak < 0 ? "" : text.slice(firstBreak + 1), folder } : { body: text, folder };
}

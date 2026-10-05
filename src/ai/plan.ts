/** Pure helpers for Ask Pip: what we send the model, and how we read (and distrust) what comes back. */
export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type Action =
  | { type: "create_note"; title: string; body: string; checklist: string[]; folder: string }
  | { type: "reminder"; text: string; at: number; noteId?: string }
  | { type: "rewrite"; noteId: string; title?: string; body: string }
  | { type: "folder"; noteId: string; folder: string };
export type Plan = { say: string; actions: Action[] };
export type NoteRef = { id: string; title: string; folder?: string; updatedAt: number };

const MAX_ACTIONS = 5;
const clip = (s: unknown, n: number) => (typeof s === "string" ? s : "").replace(/\r/g, "").trim().slice(0, n);
const two = (n: number) => String(n).padStart(2, "0");
export const localIso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`; };

/** The next 14 days spelled out, so the model never does weekday arithmetic itself. */
export const calendarLine = (now: number) => "Calendar: " + Array.from({ length: 14 }, (_, i) => { const d = new Date(now + i * 864e5); return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${localIso(d.getTime()).slice(0, 10)}`; }).join(", ") + ".";

export function askMessages(input: string, now: number, notes: NoteRef[]): Msg[] {
  const d = new Date(now);
  const list = notes.slice(0, 40).map(n => `${n.id} | ${n.title.slice(0, 60) || "Untitled"}${n.folder ? ` | ${n.folder}` : ""}`).join("\n") || "(no notes yet)";
  return [
    { role: "system", content: [
      "You are Pip, the assistant inside a quiet notes app. Be brief and plain. No emoji, no filler.",
      `Now: ${localIso(now)} (${d.toLocaleDateString("en-US", { weekday: "long" })}). Times are local to the user.`,
      calendarLine(now),
      "Reply with JSON only, no prose around it:",
      '{"say":"one short sentence","actions":[...]}',
      "Action types:",
      '{"type":"create_note","title":"","body":"","checklist":["item"],"folder":""}',
      '{"type":"reminder","text":"what to remember","at":"YYYY-MM-DDTHH:mm","noteId":"optional id"}',
      "Rules: only act on what the user asked. Use [] for actions when they just ask a question, and answer in say (max 3 sentences).",
      "Reminders need a clear time. If the time is missing or vague, return no reminder and ask for it in say.",
      "Leave folder empty unless the user names one. You cannot edit or delete existing notes: if asked, say to open the note and use Rewrite. Keep titles under 8 words. Never show note ids to the user. Resolve 'the 1st', 'Friday' and similar to the next occurrence.",
      "The user's notes (id | title | folder):", list,
    ].join("\n") },
    { role: "user", content: input.slice(0, 2000) },
  ];
}

export const REWRITES = {
  shorter: "Make it shorter. Keep every fact and the meaning.",
  clearer: "Make it clearer and better organised. Keep the meaning and the voice.",
  friendlier: "Make the tone warmer and friendlier. Keep it short.",
  fix: "Fix spelling, grammar and punctuation only. Change nothing else.",
  checklist: "Turn it into a short checklist: one actionable item per line, no numbering, no extra commentary.",
} as const;
export type RewriteMode = keyof typeof REWRITES;
export const REWRITE_LABEL: Record<RewriteMode, string> = { shorter: "Shorter", clearer: "Clearer", friendlier: "Friendlier", fix: "Fix spelling", checklist: "To checklist" };

export function rewriteMessages(mode: RewriteMode, text: string): Msg[] {
  return [
    { role: "system", content: `You edit the user's note text. ${REWRITES[mode]} Reply with the rewritten text only. No quotes, no preface, no explanation. Keep the original language.` },
    { role: "user", content: text.slice(0, 8000) },
  ];
}
export function cleanRewrite(out: string): string {
  let t = out.trim().replace(/^```[a-z]*\n?|```$/g, "").trim();
  t = t.replace(/^(here('| i)s[^\n]*:|sure[^\n]*:)\s*\n?/i, "").trim();
  if (t.length > 1 && /^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim();
  return t;
}

function findJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* ignore */ } }
  return null;
}

/** Turns model output into a safe plan. Anything off is dropped, never guessed. */
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/** Small models get weekday math wrong. If the words name exactly one weekday, trust the words over the date. */
export function snapWeekday(at: number, hint: string, now: number): number {
  const hit = DAYS.map((d, i) => ({ i, re: new RegExp(`\\b(${d}|${d.slice(0, 3)})\\b`, "i") })).filter(x => x.re.test(hint));
  if (hit.length !== 1 || new Date(at).getDay() === hit[0].i) return at;
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  for (let k = 0; k < 8; k++) { if (d.getDay() === hit[0].i) { const t = new Date(at); d.setHours(t.getHours(), t.getMinutes(), 0, 0); if (d.getTime() > now) return d.getTime(); } d.setDate(d.getDate() + 1); }
  return at;
}

export function parsePlan(text: string, now: number, known: Set<string>, hint = ""): Plan {
  const raw = findJson(text) as { say?: unknown; actions?: unknown } | null;
  if (!raw || typeof raw !== "object") return { say: clip(text, 280) || "I couldn't read that. Try again.", actions: [] };
  const say = clip(raw.say, 280);
  const out: Action[] = [];
  let dropped = 0;
  for (const a of (Array.isArray(raw.actions) ? raw.actions : []).slice(0, MAX_ACTIONS) as Record<string, unknown>[]) {
    if (!a || typeof a !== "object") { dropped++; continue; }
    if (a.type === "create_note") {
      const body = clip(a.body, 8000); const title = clip(a.title, 120); const checklist = (Array.isArray(a.checklist) ? a.checklist : []).map(x => clip(x, 200)).filter(Boolean).slice(0, 30);
      if (!title && !body && !checklist.length) { dropped++; continue; }
      out.push({ type: "create_note", title: title || body.split("\n")[0].slice(0, 60), body, checklist, folder: clip(a.folder, 80) });
    } else if (a.type === "reminder") {
      const at = typeof a.at === "string" ? new Date(a.at).getTime() : NaN; const text2 = clip(a.text, 160);
      if (!text2 || !Number.isFinite(at) || at < now - 60_000 || at > now + 2 * 365 * 864e5) { dropped++; continue; }
      const noteId = typeof a.noteId === "string" && known.has(a.noteId) ? a.noteId : undefined;
      out.push({ type: "reminder", text: text2, at: snapWeekday(at, `${hint} ${text2}`, now), noteId });
    } else if (a.type === "rewrite") {
      const noteId = typeof a.noteId === "string" ? a.noteId : ""; const body = clip(a.body, 8000);
      if (!known.has(noteId) || !body) { dropped++; continue; }
      out.push({ type: "rewrite", noteId, title: clip(a.title, 120) || undefined, body });
    } else if (a.type === "folder") {
      const noteId = typeof a.noteId === "string" ? a.noteId : ""; const folder = clip(a.folder, 40);
      if (!known.has(noteId) || !folder) { dropped++; continue; }
      out.push({ type: "folder", noteId, folder });
    } else dropped++;
  }
  const note = dropped && !out.length && !say ? "I couldn't turn that into something safe. Try wording it differently." : "";
  return { say: say || note, actions: out };
}

export const when = (t: number, now: number) => {
  const d = new Date(t), n = new Date(now); const day = d.toDateString() === n.toDateString() ? "Today" : d.toDateString() === new Date(now + 864e5).toDateString() ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return `${day}, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};

export type Suggestion = { id: string; why: string; action: Action };
export type NoteDigest = { id: string; title: string; folder?: string; body: string; open: string[]; ageDays: number };

export function suggestMessages(notes: NoteDigest[], now: number, folders: string[]): Msg[] {
  const list = notes.slice(0, 25).map(n => `${n.id} | ${n.title.slice(0, 60) || "Untitled"} | ${n.folder || "no folder"} | ${n.ageDays}d old\n${n.body.replace(/\s+/g, " ").slice(0, 220)}${n.open.length ? `\nOpen: ${n.open.slice(0, 5).join("; ")}` : ""}`).join("\n---\n");
  return [
    { role: "system", content: [
      "You are Pip, a quiet notes assistant. Look at the user's notes and suggest at most 3 genuinely useful next steps. Silence beats noise: if nothing is clearly useful, return none.",
      `Now: ${localIso(now)}. Existing folders: ${folders.slice(0, 20).join(", ") || "none"}.`, calendarLine(now),
      "Reply with JSON only: {\"suggestions\":[{\"why\":\"max 9 words, plain\",\"action\":ACTION}]}",
      'ACTION is {"type":"reminder","text":"...","at":"YYYY-MM-DDTHH:mm","noteId":"id"} when a note mentions something with a real deadline or follow-up,',
      'or {"type":"folder","noteId":"id","folder":"Name"} to file a loose note into a fitting existing folder (or a short new one when 2+ notes share a topic).',
      "Only use ids from the list. Never suggest deleting. Reminder times must be in the future, in working hours. No emoji.",
      "Notes (id | title | folder | age):", list,
    ].join("\n") },
    { role: "user", content: "Suggest." },
  ];
}
export function parseSuggestions(text: string, now: number, known: Set<string>): Suggestion[] {
  const raw = findJson(text) as { suggestions?: unknown } | null;
  const arr = raw && Array.isArray(raw.suggestions) ? raw.suggestions.slice(0, 3) as { why?: unknown; action?: unknown }[] : [];
  const out: Suggestion[] = [];
  for (const s of arr) {
    if (!s || typeof s !== "object") continue;
    const plan = parsePlan(JSON.stringify({ actions: [s.action] }), now, known, clip(s.why, 80));
    const a = plan.actions[0]; const why = clip(s.why, 80);
    if (a && why && (a.type === "reminder" || a.type === "folder")) out.push({ id: `${a.type}:${a.type === "reminder" ? a.noteId ?? a.text : a.noteId}:${a.type === "folder" ? a.folder : a.at}`, why, action: a });
  }
  return out;
}
/** Free, offline nudge: a checklist left open for days. */
export function localSuggestions(notes: NoteDigest[], now: number): Suggestion[] {
  const t = new Date(now); t.setDate(t.getDate() + (t.getHours() >= 9 ? 1 : 0)); t.setHours(9, 0, 0, 0);
  return notes.filter(n => n.open.length >= 2 && n.ageDays >= 3).slice(0, 1).map(n => ({ id: `stale:${n.id}`, why: `${n.open.length} open items in ${n.title || "Untitled"}`, action: { type: "reminder" as const, text: `Finish ${n.title || "your list"}`, at: t.getTime(), noteId: n.id } }));
}

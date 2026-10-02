import { cleanFolder } from "./repo/repo";
import { rankNotes } from "./ai";
import type { Note } from "./domain";
import type { AgentResult, Op } from "./agent";
import type { Answer, Judge } from "./jev";

/** Ask Pip, powered by Jev. Code owns the workflow. Jev only makes typed judgments (which kind of request, which notes, which lines, which folder, which title).
 *  Nothing here writes text: answers are quotes from the notes, and every change is a proposal the user applies. Thresholds are starting values to tune on real use. */
export const T = { route: 0.3, note: 0.5, line: 0.55, folder: 0.5, title: 0.4 };
const SHORT = 20, TOP_CODE = 3, MAX_SEGS = 40, PER_NOTE = 12;
type Store = { list(o: { view: "all"; query: string }): Promise<Note[]> };
type Seg = { text: string; note: Note };
type Gen = (instruction: string, notes: Note[], signal?: AbortSignal) => Promise<string>;
type Run = { judge: Judge; gen?: Gen; signal?: AbortSignal; onStep?: (s: string, notes?: Note[]) => void };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const noul = (a: Record<string, Answer>, k: string) => a[k]?.noul ?? 0;

export function segmentsOf(n: Note, max = PER_NOTE): string[] {
  const out: string[] = [];
  for (const raw of n.body.split(/\n+/)) {
    const line = flat(raw.replace(/^[-*•]\s+|^#+\s+/, ""));
    if (line.length < 3) continue;
    if (line.length <= 220) out.push(line); else for (const s of line.split(/(?<=[.!?])\s+/)) if (flat(s).length >= 3) out.push(clip(flat(s), 220));
  }
  for (const c of n.checklist) if (c.text.trim()) out.push(`${c.done ? "Done" : "To do"}: ${clip(flat(c.text), 200)}`);
  return out.slice(0, max);
}
export function titleCandidates(n: Note): string[] {
  const lines = n.body.split(/\n+/).map(l => flat(l.replace(/^[-*•#]+\s*/, ""))).filter(l => l.length > 1);
  const first = lines[0] ?? "", sent = flat(n.body).split(/(?<=[.!?])\s+/)[0] ?? "", words = flat(n.body).split(" ").slice(0, 5).join(" ");
  const c = [first, sent, words, lines[1] ?? "", n.title].map(s => clip(s.replace(/[.:]+$/, ""), 60)).filter(Boolean);
  const uniq = [...new Set(c)]; while (uniq.length && uniq.length < 5) uniq.push(uniq[0]); return uniq.slice(0, 5);
}
const segsFor = (notes: Note[]): Seg[] => notes.flatMap(n => segmentsOf(n).map(text => ({ text, note: n }))).slice(0, MAX_SEGS);
const card = (n: Note) => ({ title: clip(n.title || "Untitled", 80), folder: n.folder ?? "", text: clip(flat(n.body), 160) });

function pickLines(segs: Seg[], a: Record<string, Answer>, min = T.line, max = 3) {
  return segs.map((s, i) => ({ ...s, p: noul(a, `s${i}`) })).filter(x => x.p >= min).sort((x, y) => y.p - x.p).slice(0, max);
}
const quote = (xs: { text: string; note: Note }[]) => xs.map(x => `In "${x.note.title || "Untitled"}": “${x.text}”`).join("\n");
const CAN = "I find things in your notes, file and rename them, pin them, and pull lines together. I don't write new text.";

export async function runJev(request: string, store: Store, o: Run & { scope?: Note }): Promise<AgentResult> {
  const { judge, signal } = o; let calls = 0;
  const live = (await store.list({ view: "all", query: "" })).filter(n => n.deletedAt === null);
  const scope = o.scope ? { ...o.scope, revision: live.find(n => n.id === o.scope!.id)?.revision ?? o.scope.revision } : undefined;
  const pool = scope ? [scope] : live;
  const ops: Op[] = []; const looked = new Map<string, Note>(); const see = (ns: Note[]) => ns.forEach(n => looked.set(n.id, n));
  const done = (message: string): AgentResult => ({ message, ops, looked: [...looked.values()], calls });
  if (!pool.length) return done("There are no notes to look through yet.");
  const q = clip(request, 400);

  // Call 1: what kind of request, which notes matter, and (speculatively) the lines of the likeliest notes. All in one parallel request.
  const short = scope ? [scope] : rankNotes(q, pool, SHORT);
  const spec = scope ? [scope] : short.slice(0, TOP_CODE);
  const specSegs = segsFor(spec);
  o.onStep?.(scope ? "Reading this note" : `Checking ${short.length} notes`, short.slice(0, 4));
  const first = await judge({ request: q, scope: scope ? "one open note" : "whole library", notes: short.map(card), segments: specSegs.map(s => s.text) },
    [{ name: "route" }, ...(scope ? [] : [{ name: "relevance" as const, args: { n: short.length } }]), { name: "segments", args: { n: specSegs.length } }], signal); calls++;
  const route = first.intent; const intent = route?.choice ?? "other";
  const rel = scope ? [scope] : short.filter((_, i) => noul(first, `r${i}`) >= T.note);
  if ((route?.confidence ?? 1) < T.route && intent !== "find") return done(`I'm not sure what you'd like me to do. ${CAN}`);
  if (intent === "write") {
    // Jev decided this is a writing request. Only now does the connected ChatGPT run, once, over the few notes Jev picked.
    if (!o.gen) return done("That needs new writing. Connect ChatGPT in Settings and ask again. Until then I can find, file, rename, pin and pull lines together.");
    const src = (scope ? [scope] : rel.length ? rel : short).slice(0, 5); see(src);
    o.onStep?.("Writing it", src.slice(0, 4));
    return done(await o.gen(q, src, signal));
  }
  if (intent === "other") return done(CAN);
  see(rel.slice(0, 5));

  if (intent === "find" || intent === "gather") {
    let segs = specSegs, ans = first;
    const hit = pickLines(segs, ans, T.line, 8);
    const covered = new Set(spec.map(n => n.id));
    const more = rel.filter(n => !covered.has(n.id)).slice(0, 6);
    if (more.length && (intent === "gather" || !hit.length || hit[0].p < 0.75)) {
      o.onStep?.("Looking at the best matches", more.slice(0, 4));
      const s2 = segsFor(intent === "gather" ? [...rel].slice(0, 8) : more); const a2 = await judge({ request: q, segments: s2.map(s => s.text) }, [{ name: "segments", args: { n: s2.length } }], signal); calls++;
      segs = intent === "gather" ? s2 : [...specSegs, ...s2]; ans = intent === "gather" ? a2 : { ...first, ...Object.fromEntries(Object.entries(a2).map(([k, v]) => [`s${Number(k.slice(1)) + specSegs.length}`, v])) };
    }
    o.onStep?.("Picking the right lines");
    if (intent === "find") {
      const best = pickLines(segs, ans); see(best.map(x => x.note));
      return done(best.length ? quote(best) : "I couldn't find that in your notes.");
    }
    const lines = pickLines(segs, ans, T.line, 20); if (!lines.length) return done("I couldn't find lines to pull together for that.");
    const groups = new Map<string, { note: Note; items: string[] }>(); lines.forEach(l => { const g = groups.get(l.note.id) ?? { note: l.note, items: [] }; g.items.push(l.text); groups.set(l.note.id, g); }); see([...groups.values()].map(g => g.note));
    const title = clip(flat(q.replace(/^(please\s+)?(pull|gather|collect|put|make|compile)\s+/i, "").replace(/\s+(into|in)\s+(one|a)\s+note.*$/i, "").replace(/^./, c => c.toUpperCase())), 60) || "Roundup";
    ops.push({ kind: "create", title, body: [...groups.values()].map(g => `${g.note.title || "Untitled"}\n${g.items.map(t => `- ${t}`).join("\n")}`).join("\n\n") });
    return done(`I pulled ${lines.length} line${lines.length === 1 ? "" : "s"} from ${groups.size} note${groups.size === 1 ? "" : "s"} into a new note.`);
  }

  if (intent === "pin") {
    const unpin = /\bun-?pin|remove .*pin\b/i.test(q); const targets = (scope ? [scope] : rel.filter((_, i) => i < 5));
    for (const n of targets) if (n.pinned !== !unpin) ops.push({ kind: "edit", id: n.id, rev: n.revision, before: { title: n.title, body: n.body, folder: n.folder, pinned: n.pinned }, pinned: !unpin });
    see(targets); return done(ops.length ? `${unpin ? "Unpinning" : "Pinning"} ${ops.length} note${ops.length === 1 ? "" : "s"}.` : `${targets.length === 1 ? "That note is" : "Those notes are"} already ${unpin ? "unpinned" : "pinned"}.`);
  }

  // file / retitle: one more parallel request over the chosen notes.
  const loose = /\b(loose|unfiled|unsorted|no folder|without a folder|inbox)\b/i.test(q);
  const targets = (scope ? [scope] : loose ? pool.filter(n => !n.folder).slice(0, 25) : rel.slice(0, 25));
  if (!targets.length) return done(intent === "file" ? "I didn't find notes to file." : "I didn't find notes to rename.");
  see(targets);
  if (intent === "file") {
    const folders = [...new Set(pool.map(n => n.folder).filter((f): f is string => !!f))].slice(0, 40);
    if (!folders.length) return done("You don't have any folders yet to file into. Create one and I'll sort notes into it.");
    o.onStep?.(`Filing ${targets.length} note${targets.length === 1 ? "" : "s"}`, targets.slice(0, 4));
    const a = await judge({ notes: targets.map(card) }, [{ name: "folder", args: { folders, n: targets.length } }], signal); calls++;
    targets.forEach((n, i) => { const c = a[`f${i}`]; const f = c?.choice && c.choice !== "__leave" ? folders[Number(c.choice.slice(1))] : undefined; if (f && (c?.confidence ?? 0) >= T.folder && cleanFolder(f) !== (n.folder ?? "")) ops.push({ kind: "edit", id: n.id, rev: n.revision, before: { title: n.title, body: n.body, folder: n.folder, pinned: n.pinned }, folder: cleanFolder(f) }); });
    return done(ops.length ? `Moving ${ops.length} note${ops.length === 1 ? "" : "s"} into your folders.` : "Nothing clearly belongs in your existing folders, so I left them.");
  }
  o.onStep?.(`Choosing names for ${targets.length} note${targets.length === 1 ? "" : "s"}`, targets.slice(0, 4));
  const cands = targets.map(titleCandidates);
  const a = await judge({ notes: targets.map((n, i) => ({ text: clip(flat(n.body), 200), titles: cands[i] })) }, [{ name: "title", args: { n: targets.length } }], signal); calls++;
  targets.forEach((n, i) => { const c = a[`t${i}`]; const t = c?.choice ? cands[i][Number(c.choice.slice(1))] : undefined; if (t && (c?.confidence ?? 0) >= T.title && t !== n.title) ops.push({ kind: "edit", id: n.id, rev: n.revision, before: { title: n.title, body: n.body, folder: n.folder, pinned: n.pinned }, title: t }); });
  return done(ops.length ? `I picked clearer titles for ${ops.length} note${ops.length === 1 ? "" : "s"} from words already in them.` : "The current titles already read fine.");
}

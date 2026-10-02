// pip-jev: the only place the TypeSafe key lives. Pip calls this with the user's Pip session; it builds fixed question packs and returns typed answers.
const SB = "https://ovkfjiciwuhcqqpmdgaa.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92a2ZqaWNpd3VoY3FxcG1kZ2FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NTc4MDcsImV4cCI6MjEwNjUzMzgwN30.AW0bwt7Lg69R51tQpM4IMLPqHy4GtDEzKmuoZMSjR_4";
const MAX_BODY = 60000, MAX_N = 40, PER_MIN = 40;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "POST, OPTIONS", "access-control-max-age": "86400" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const seen = new Map(); const authCache = new Map();

const INTENTS = {
  find: "The user wants to find or be told something that is written in their notes (a fact, date, plan, or where something is).",
  file: "The user wants notes sorted into folders or moved between folders.",
  retitle: "The user wants notes renamed or given better titles.",
  pin: "The user wants notes pinned or unpinned.",
  gather: "The user wants lines from several notes pulled together into one new note (a roundup, list or collection).",
  write: "The user wants new text written, summarized, rewritten or explained in fresh words.",
  other: "None of the above, or unclear.",
};
const n = (x, max = MAX_N) => Math.max(0, Math.min(max, Number.isFinite(+x) ? Math.floor(+x) : 0));
const PACKS = {
  route: () => ({ intent: { type: "choice", instructions: { question: "Which kind of request is `request`? Choose the single best match. A question about what the notes say is find, not write.", scope: "`scope` says whether the request is about the whole library or one open note." }, criteria: INTENTS } }),
  relevance: a => Object.fromEntries(Array.from({ length: n(a.n) }, (_, i) => [`r${i}`, { type: "noul", instructions: `Is \`notes[${i}]\` about the same subject as \`request\`, so that it would help answer or carry out the request?`, criteria: { true: "The note covers the subject or contains what is asked about.", false: "The note is about something else." } }])),
  segments: a => Object.fromEntries(Array.from({ length: n(a.n) }, (_, i) => [`s${i}`, { type: "noul", instructions: `Does \`segments[${i}]\` directly state the answer to, or the information asked for in, \`request\`?`, criteria: { true: "This line itself states the thing asked about (date, plan, fact, item).", false: "It is unrelated, or only background." } }])),
  folder: a => { const fs = (Array.isArray(a.folders) ? a.folders : []).map(f => String(f).slice(0, 60)).slice(0, 40); const crit = { __leave: "No listed folder clearly fits, or the note should stay where it is." }; fs.forEach((f, k) => (crit[`f${k}`] = `Folder "${f}"`)); return Object.fromEntries(Array.from({ length: n(a.n, 25) }, (_, i) => [`f${i}`, { type: "choice", instructions: `Which folder should \`notes[${i}]\` be filed in? Judge by its subject.`, criteria: crit }])); },
  title: a => Object.fromEntries(Array.from({ length: n(a.n, 25) }, (_, i) => [`t${i}`, { type: "choice", instructions: `Which of \`notes[${i}].titles\` is the clearest short name for the note (\`notes[${i}].text\`)?`, criteria: Object.fromEntries(Array.from({ length: 5 }, (_, k) => [`c${k}`, `notes[${i}].titles[${k}]`])) }])),
};

async function authed(req) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) return null;
  const hit = authCache.get(t); if (hit && hit.exp > Date.now()) return hit.id;
  const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SB_ANON, authorization: `Bearer ${t}` } });
  if (!r.ok) return null; const u = await r.json().catch(() => null); if (!u?.id) return null;
  authCache.set(t, { id: u.id, exp: Date.now() + 5 * 60000 }); if (authCache.size > 500) authCache.clear(); return u.id;
}
function limited(id) { const m = Math.floor(Date.now() / 60000), e = seen.get(id); if (!e || e.m !== m) { seen.set(id, { m, c: 1 }); if (seen.size > 2000) seen.clear(); return false; } return ++e.c > PER_MIN; }

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return json({ error: "method" }, 405);
    if (env.ENABLED === "off") return json({ error: "off" }, 503);
    const uid = await authed(req); if (!uid) return json({ error: "auth" }, 401);
    if (limited(uid)) return json({ error: "rate" }, 429);
    const text = await req.text(); if (text.length > MAX_BODY) return json({ error: "size" }, 413);
    let b; try { b = JSON.parse(text); } catch { return json({ error: "json" }, 400); }
    const packs = Array.isArray(b.packs) ? b.packs.slice(0, 4) : [];
    const questions = {};
    for (const p of packs) { const f = PACKS[p?.name]; if (!f) return json({ error: "pack" }, 400); Object.assign(questions, f(p.args || {})); }
    if (!Object.keys(questions).length || Object.keys(questions).length > 120) return json({ error: "empty" }, 400);
    const r = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { authorization: `Bearer ${env.TYPESAFE_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ state: b.state ?? {}, model: "jev-latest", questions }) });
    if (!r.ok) return json({ error: "upstream", status: r.status }, 502);
    const j = await r.json(); const out = {};
    for (const [k, a] of Object.entries(j.answers || {})) out[k] = a.type === "noul" ? { noul: a.noul } : { choice: a.choice, confidence: a.confidence };
    return json({ answers: out, tokens: j.usage?.input_tokens ?? 0 });
  },
};

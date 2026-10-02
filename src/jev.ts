import { freshSession } from "./cloud/auth";

/** Pip's judgment service. It holds the TypeSafe key; the app only ever sees typed answers. */
export const JEV_URL = "https://pip-jev.hope-joe.workers.dev";
export type Answer = { noul?: number; choice?: string; confidence?: number };
export type Pack = { name: "route" | "relevance" | "segments" | "folder" | "title"; args?: Record<string, unknown> };
export type Judge = (state: unknown, packs: Pack[], signal?: AbortSignal) => Promise<Record<string, Answer>>;
export class JevError extends Error { constructor(m: string) { super(m); this.name = "JevError"; } }

export const judge: Judge = async (state, packs, signal) => {
  const s = await freshSession();
  if (!s) throw new JevError("Sign in again to use Ask.");
  let r: Response;
  try { r = await fetch(JEV_URL, { method: "POST", signal, headers: { "content-type": "application/json", authorization: `Bearer ${s.access_token}` }, body: JSON.stringify({ state, packs }) }); }
  catch (e) { if ((e as Error).name === "AbortError") throw new JevError("Cancelled."); throw new JevError("Couldn't reach Ask. Check your connection."); }
  if (r.status === 401) throw new JevError("Sign in again to use Ask.");
  if (r.status === 429) throw new JevError("Slow down a moment, then try again.");
  if (!r.ok) throw new JevError("Ask is unavailable right now. Try again in a minute.");
  const j = await r.json().catch(() => null) as { answers?: Record<string, Answer> } | null;
  if (!j?.answers) throw new JevError("Ask sent back something unreadable.");
  return j.answers;
};

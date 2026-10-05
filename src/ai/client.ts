import { call, isNative, kv } from "../native";
import type { Msg } from "./plan";

export type AiStatus = { primary: "nvidia" | "gemini" | null; nvidia: boolean; gemini: boolean };
export const PROVIDER_LABEL = { nvidia: "NVIDIA", gemini: "Gemini" } as const;
export const PROVIDER_HELP = {
  nvidia: { url: "https://build.nvidia.com/settings/api-keys", where: "build.nvidia.com" },
  gemini: { url: "https://aistudio.google.com/apikey", where: "aistudio.google.com" },
} as const;

/** The browser preview has no key (and NVIDIA blocks browser calls), so it runs a small offline stand-in. */
const PREVIEW = import.meta.env.VITE_PREVIEW === "true";
const MOCK_KEY = "pip.ai.mock";
export const aiAvailable = () => isNative() || PREVIEW;

export async function aiStatus(): Promise<AiStatus> {
  if (isNative()) return call<AiStatus>("ai_status");
  const on = PREVIEW && kv.getItem(MOCK_KEY) !== "off";
  return { primary: on ? "nvidia" : null, nvidia: on, gemini: false };
}
export async function aiSetKey(provider: "nvidia" | "gemini", key: string): Promise<AiStatus> {
  if (isNative()) return call<AiStatus>("ai_set_key", { providerId: provider, key });
  kv.setItem(MOCK_KEY, key.trim() ? "on" : "off"); return aiStatus();
}
export async function aiSetPrimary(provider: "nvidia" | "gemini"): Promise<AiStatus> {
  return isNative() ? call<AiStatus>("ai_set_primary", { providerId: provider }) : aiStatus();
}
export async function aiComplete(messages: Msg[], maxTokens = 2500): Promise<string> {
  if (isNative()) return call<string>("ai_complete", { messages, maxTokens });
  if (!PREVIEW) throw new Error("AI runs in the Pip app.");
  await new Promise(r => setTimeout(r, 650));
  return mock(messages);
}

/** Offline stand-in for screenshots. Deterministic, tiny, not shipped to users (needs VITE_PREVIEW). */
function mock(m: Msg[]): string {
  const sys = m[0].content, user = m[m.length - 1].content;
  if (sys.includes('{"suggestions"')) {
    const ids = [...sys.matchAll(/^(\S+) \| (.*?) \| /gm)].map(x => x[1]).filter(x => !x.startsWith("Now"));
    const d = new Date(); d.setDate(d.getDate() + 1); const p = (n: number) => String(n).padStart(2, "0");
    return JSON.stringify({ suggestions: ids.length ? [{ why: "Landing page needs a follow-up", action: { type: "reminder", text: "Review landing page idea", at: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T10:00`, noteId: ids[0] } }] : [] });
  }
  if (!sys.includes("Reply with JSON only")) {
    if (sys.includes("one actionable item")) return user.split(/[.\n;]/).map(s => s.trim()).filter(Boolean).join("\n");
    if (sys.includes("Make it shorter")) return user.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    return user.replace(/\bi\b/g, "I").replace(/\s+/g, " ").trim();
  }
  const now = new Date(sys.match(/Now: (\S+)/)![1]);
  const t = user.toLowerCase();
  const at = (days: number, h: number, mi = 0) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, mi, 0, 0); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(h)}:${p(mi)}`; };
  const acts: unknown[] = [];
  if (/remind/.test(t)) { const tm = t.match(/(\d{1,2})(?::(\d\d))?\s*(am|pm)/); const h = tm ? (+tm[1] % 12) + (tm[3] === "pm" ? 12 : 0) : 9; const what = user.replace(/^.*?remind me( to)?/i, "").replace(/\b(tomorrow|today)\b|\bat \d.*$/gi, "").trim() || "Reminder"; acts.push({ type: "reminder", text: what.charAt(0).toUpperCase() + what.slice(1), at: at(/tomorrow/.test(t) ? 1 : 0, h, tm?.[2] ? +tm[2] : 0) }); }
  if (/(list|note|packing|checklist)/.test(t) && !/remind/.test(t)) { const items = (user.split(/:|,\s*|\band\b/).slice(1)).map(s => s.trim()).filter(Boolean); acts.push({ type: "create_note", title: /pack/i.test(t) ? "Packing list" : "New note", body: "", checklist: items.length ? items : ["Item one"], folder: "" }); }
  return JSON.stringify({ say: acts.length ? "Here's what I'll do." : "I can make notes, rewrite them, and set reminders.", actions: acts });
}

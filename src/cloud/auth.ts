import { call, isNative, kv } from "../native";
import { SUPABASE_ANON, SUPABASE_URL } from "./config";

export type Session = { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email: string; name?: string } };
const KEY = "pip.session.v1", VERIFIER = "pip.pkce.v1";
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
const sha = async (s: string) => b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const now = () => Math.floor(Date.now() / 1000);

export class AuthError extends Error {}
const headers = (token?: string) => ({ apikey: SUPABASE_ANON, "content-type": "application/json", authorization: `Bearer ${token ?? SUPABASE_ANON}` });

function toSession(j: any): Session {
  if (!j?.access_token || !j?.user?.id) throw new AuthError("Sign-in didn't finish. Try again.");
  const m = j.user.user_metadata ?? {};
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at ?? now() + (j.expires_in ?? 3600), user: { id: j.user.id, email: j.user.email ?? "", name: m.full_name ?? m.name } };
}
const store = (s: Session | null) => kv.setItem(KEY, s ? JSON.stringify(s) : "");
export function loadSession(): Session | null { try { const r = kv.getItem(KEY); return r ? JSON.parse(r) as Session : null; } catch { return null; } }

async function post(path: string, body: unknown, token?: string) {
  let r: Response;
  try { r = await fetch(`${SUPABASE_URL}${path}`, { method: "POST", headers: headers(token), body: JSON.stringify(body) }); }
  catch { throw new AuthError("Couldn't reach Pip's sign-in. Check your connection."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AuthError(j.error_description ?? j.msg ?? j.error ?? `Sign-in failed (${r.status}).`);
  return j;
}

/** A valid access token, refreshed when it is within a minute of expiring. Returns null when signed out or the refresh was refused. */
export async function freshSession(): Promise<Session | null> {
  const s = loadSession(); if (!s) return null;
  if (s.expires_at - 60 > now()) return s;
  try { const n = toSession(await post("/auth/v1/token?grant_type=refresh_token", { refresh_token: s.refresh_token })); store(n); return n; }
  catch (e) {
    // A refused refresh means the session is gone. A network error just means try later with what we have.
    if (e instanceof AuthError && /reach/i.test(e.message)) return s;
    store(null); return null;
  }
}
export async function signOut() { const s = loadSession(); store(null); if (s) fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, { method: "POST", headers: headers(s.access_token) }).catch(() => {}); }

async function exchange(code: string, verifier: string): Promise<Session> {
  const s = toSession(await post("/auth/v1/token?grant_type=pkce", { auth_code: code, code_verifier: verifier })); store(s); return s;
}

/** Desktop: the browser comes back to a loopback listener in Rust. Web preview: a normal redirect. */
export async function signInGoogle(): Promise<Session | null> {
  const verifier = rand(), challenge = await sha(verifier);
  const q = (redirect: string) => `${SUPABASE_URL}/auth/v1/authorize?provider=google&code_challenge=${challenge}&code_challenge_method=s256&redirect_to=${encodeURIComponent(redirect)}&scopes=${encodeURIComponent("email profile")}`;
  if (isNative()) {
    const state = rand();
    const code = await call<string>("oauth_browser", { urlTemplate: q(`http://127.0.0.1:{PORT}/auth/callback?state=${state}`), state }).catch(e => { throw new AuthError(String(e)); });
    return exchange(code, verifier);
  }
  sessionStorage.setItem(VERIFIER, verifier); location.href = q(location.origin + location.pathname); return null;
}
/** Finishes a web redirect sign-in if the page was opened with ?code=. */
export async function finishRedirect(): Promise<Session | null> {
  const p = new URLSearchParams(location.search), code = p.get("code"), v = sessionStorage.getItem(VERIFIER);
  if (!code || !v) return null;
  sessionStorage.removeItem(VERIFIER); history.replaceState(null, "", location.pathname);
  return exchange(code, v);
}

/** ChatGPT proves who you are through OpenAI's own sign-in; our Supabase function verifies it and trades it for a normal session. */
export async function signInChatGpt(): Promise<Session> {
  if (!isNative()) throw new AuthError("ChatGPT sign-in works in the Pip desktop app.");
  await call<string>("chatgpt_sign_in").catch(e => { throw new AuthError(String(e)); });
  const idToken = await call<string>("chatgpt_id_token").catch(e => { throw new AuthError(String(e)); });
  const j = await post("/functions/v1/chatgpt-auth", { id_token: idToken });
  const v = await post("/auth/v1/verify", { type: j.type ?? "magiclink", token_hash: j.token_hash });
  const s = toSession(v); store(s); return s;
}

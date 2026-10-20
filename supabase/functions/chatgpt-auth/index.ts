// Turns a verified "Sign in with ChatGPT" ID token into a Supabase sign-in.
// The app sends the ID token; we check OpenAI's signature, issuer and age, then hand back
// a one-time token_hash the app exchanges for a normal Supabase session (verifyOtp).
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const ISSUER = "https://auth.openai.com";
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  let idToken = "";
  try { idToken = String((await req.json()).id_token ?? ""); } catch { return reply(400, { error: "Bad request" }); }
  if (!idToken) return reply(400, { error: "Missing id_token" });
  let claims;
  try {
    ({ payload: claims } = await jwtVerify(idToken, jwks, { issuer: ISSUER, clockTolerance: 30 }));
  } catch { return reply(401, { error: "ChatGPT sign-in could not be verified" }); }
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  if (!email || claims.email_verified === false) return reply(401, { error: "ChatGPT account has no verified email" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) return reply(500, { error: "Could not start a session" });
  return reply(200, { email, token_hash: data.properties.hashed_token, type: data.properties.verification_type });
});

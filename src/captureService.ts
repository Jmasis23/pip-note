import { freshSession } from "./cloud/auth";
import { SUPABASE_ANON, SUPABASE_URL } from "./cloud/config";
import { validatedArrangement, type CaptureState } from "./captureArrangement";
// Activation is a separate reviewed build/deployment choice. Off by default.
export const captureModelEnabled = import.meta.env.VITE_CAPTURE_JEV === "true";
export async function suggestCapture(state: CaptureState, signal: AbortSignal) {
  if (!captureModelEnabled) return null;
  const session=await freshSession(); if (!session || signal.aborted) return null;
  const r=await fetch(`${SUPABASE_URL}/functions/v1/capture-arrange`,{method:"POST",headers:{apikey:SUPABASE_ANON,authorization:`Bearer ${session.access_token}`,"content-type":"application/json"},body:JSON.stringify(state),signal});
  if (!r.ok) throw new Error("Suggestions unavailable");
  return validatedArrangement(state,await r.json());
}

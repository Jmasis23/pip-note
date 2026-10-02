/** Desktop (Tauri) bridge. In a plain browser every function here is a no-op or falls back, so the web app works unchanged. */
import type { KV } from "./repo/repo";

export const isNative = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core"); return invoke<T>(cmd, args);
}
export async function onNativeEvent(name: string, cb: () => void): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event"); return listen(name, () => cb());
}

/** Notes live in files in the app data folder (written atomically by Rust), not in the web view cache. Reads are served from memory. */
let mem: Map<string, string> | null = null;
let chain: Promise<unknown> = Promise.resolve();
export async function initStorage(): Promise<void> {
  if (!isNative()) return;
  const all = await call<Record<string, string>>("store_load");
  mem = new Map(Object.entries(all));
}
export const kv: KV = {
  getItem: k => (mem ? mem.get(k) ?? null : globalThis.localStorage.getItem(k)),
  setItem: (k, v) => {
    if (!mem) { globalThis.localStorage.setItem(k, v); return; }
    mem.set(k, v);
    chain = chain.then(() => call("store_set", { key: k, value: v })).catch(e => console.error("store_set failed", e));
  },
};
export async function exportFile(name: string, text: string, type: string): Promise<string> {
  if (isNative()) return call<string>("export_file", { name, content: text });
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  return "";
}
export const updater = {
  check: () => call<string | null>("update_check"),
  download: () => call<string>("update_download"),
  install: () => call<void>("update_install"),
};
export const syncDesktopPrefs = (shakeEnabled: boolean, shortcut: string, level: string = "normal") => {
  if (!isNative()) return;
  void call("set_shake_enabled", { enabled: shakeEnabled }).catch(() => {});
  void call("set_shake_level", { level }).catch(() => {});
  void call("set_shortcut", { shortcut }).catch(() => {});
};

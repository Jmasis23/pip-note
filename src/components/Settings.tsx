import { Beta } from "./Beta";
import { useEffect, useState } from "react";
import type { Accent, Prefs, Size, TextSize, Theme } from "../domain";
import { Dropdown } from "./Dropdown";
import { repo } from "../useNotes";
import { PRESETS, getAiRaw, normalizeBase, setAiConfig, testAi, validBase, AiError, aiHasStoredKey, chatGptState, chatGptSignIn, chatGptSignOut, chatGptModels, chatGptUse } from "../ai";
import { exportFile, isNative, updater } from "../native";
import { loadSession, signOut } from "../cloud/auth";
import { onSyncStatus, syncNow, syncStatus } from "../cloud/sync";

const keyName = (e: KeyboardEvent) => {
  const k = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  return [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Win", k].filter(Boolean).join("+");
};

const TEXT_OPTS: [TextSize, string][] = [["xs", "Tiny"], ["s", "Small"], ["m", "Medium"], ["l", "Large"]];
const SIZES: [Size, string][] = [["s", "Small"], ["m", "Medium"], ["l", "Large"]];
const ACCENTS: [Accent, string, string][] = [["lavender", "#8A90FF", "Lavender"], ["sky", "#4FA8F5", "Sky"], ["mint", "#3DBE8C", "Mint"], ["peach", "#F59A6B", "Peach"], ["rose", "#EE6F96", "Rose"], ["graphite", "#6B6F82", "Graphite"]];
function Seg<T extends string>({ label, value, opts, onChange }: { label: string; value: T; opts: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg" role="radiogroup" aria-label={label}>{opts.map(([id, t]) => <button key={id} role="radio" aria-checked={value === id} className={value === id ? "on" : ""} onClick={() => onChange(id)}>{t}</button>)}</div>;
}
export function Settings({ prefs, setPrefs, onClose, onRestored }: { prefs: Prefs; setPrefs: (p: Prefs) => Promise<void>; onClose: () => void; onRestored: () => void }) {
  const [rec, setRec] = useState(false);
  const [msg, setMsg] = useState("");
  const [backups, setBackups] = useState<{ day: string; count: number }[]>([]);
  useEffect(() => { void repo.listBackups().then(setBackups); }, []);
  useEffect(() => {
    if (!rec) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault(); const k = keyName(e); if (!k) return;
      if (!(e.ctrlKey || e.altKey || e.metaKey)) { setMsg("Add Ctrl, Alt or Win so typing still works."); return; }
      setRec(false); setMsg(""); void setPrefs({ ...prefs, shortcut: k });
    };
    window.addEventListener("keydown", on, true); return () => window.removeEventListener("keydown", on, true);
  }, [rec, prefs]);
  const raw = getAiRaw();
  const [aiBase, setAiBase] = useState(raw.baseUrl ?? "");
  const [aiKey, setAiKey] = useState(raw.key ?? "");
  const [aiModel, setAiModel] = useState(raw.model ?? "");
  const [aiState, setAiState] = useState("");
  const cg = chatGptState();
  const [cgBusy, setCgBusy] = useState(false); const [cgMsg, setCgMsg] = useState("");
  const [cgModels, setCgModels] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => { if (cg) void chatGptModels().then(setCgModels).catch(() => {}); }, [cg?.email]);
  const cgRun = async (f: () => Promise<void>, wait = "") => { setCgBusy(true); setCgMsg(wait); try { await f(); setCgMsg(""); } catch (e) { setCgMsg(e instanceof AiError ? e.message : "Something went wrong."); } finally { setCgBusy(false); } };
  const local = /^http:\/\/(localhost|127\.0\.0\.1)/.test(aiBase.trim());
  const aiReady = validBase(aiBase) && !!aiModel.trim() && (!!aiKey.trim() || local || aiHasStoredKey());
  const saveAi = async (test: boolean) => {
    const cfg = { baseUrl: normalizeBase(aiBase), key: aiKey.trim(), model: aiModel.trim() };
    if (!test) { await setAiConfig(cfg); setAiState("Saved on this device."); return; }
    setAiState("Testing");
    try { await testAi(cfg); await setAiConfig(cfg); setAiKey(""); setAiState("Works. AI tools are on."); }
    catch (e) { setAiState(e instanceof AiError ? e.message : "Test failed."); }
  };
  const exportAll = async () => { const t = await repo.exportJson(); try { const where = await exportFile("pip-notes.json", t, "application/json"); if (where) setMsg(`Saved to ${where}`); } catch { setMsg("Couldn't save the file."); } };
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings" tabIndex={-1} ref={el => { if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); }}>
        <header><h2>Settings</h2><button className="ghost" onClick={onClose}>Done</button></header>
        <AccountRow />
        <label className="row"><div><b>Shake to capture</b><p>Shake the mouse side to side to open capture. Ignored while a button is held.</p></div><input type="checkbox" className="switch" checked={prefs.shakeToCapture} onChange={e => void setPrefs({ ...prefs, shakeToCapture: e.target.checked })} /></label>
        {prefs.shakeToCapture && <div className="row col"><div><b>Shake sensitivity</b><p role="status" aria-live="polite">{(() => { const v = prefs.shakeSens ?? 50; return v < 25 ? "Needs a firm, deliberate shake." : v < 45 ? "A little firmer than usual." : v <= 55 ? "A quick back and forth." : v <= 75 ? "Picks up smaller shakes." : "Fires on a small wiggle. May trigger by accident."; })()}</p></div>
          <div className="sens"><span>Firm</span><input type="range" min={0} max={100} step={1} value={prefs.shakeSens ?? 50} aria-label="Shake sensitivity" onChange={e => void setPrefs({ ...prefs, shakeSens: Number(e.target.value) })} /><span>Hair-trigger</span></div></div>}
        <div className="row"><div><b>Capture shortcut</b><p>Second way in, same panel.</p></div>
          <button className="ghost field" onClick={() => { setRec(true); setMsg("Press the new keys"); }}>{rec ? "Press keys" : prefs.shortcut}</button></div>
        {msg && <p className="status" role="status">{msg}</p>}
        <div className="row"><div><b>Theme</b></div>
          <div className="seg" role="radiogroup" aria-label="Theme">{(["system", "light", "dark"] as Theme[]).map(t => <button key={t} role="radio" aria-checked={prefs.theme === t} className={prefs.theme === t ? "on" : ""} onClick={() => void setPrefs({ ...prefs, theme: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div></div>
        <div className="row col look"><div><b>Appearance</b><p>Taste settings. They apply right away and stay on this device.</p></div>
          <div className="look-grid">
            <span>Card size</span><Seg label="Card size" value={prefs.cardSize} opts={SIZES} onChange={v => void setPrefs({ ...prefs, cardSize: v })} />
            <span>Text size</span><Seg label="Text size" value={prefs.textSize} opts={TEXT_OPTS} onChange={v => void setPrefs({ ...prefs, textSize: v })} />
            <span>Accent</span>
            <div className="swatches" role="radiogroup" aria-label="Accent colour">{ACCENTS.map(([id, hex, name]) => <button key={id} role="radio" aria-checked={prefs.accent === id} aria-label={name} title={name} className={prefs.accent === id ? "on" : ""} style={{ background: hex }} onClick={() => void setPrefs({ ...prefs, accent: id })} />)}</div>
            <span>Cards</span><Seg label="Card colours" value={prefs.tint} opts={[["color", "Colourful"], ["quiet", "Quiet"]]} onChange={v => void setPrefs({ ...prefs, tint: v })} />
          </div></div>
        <label className="row"><div><b>Reduce motion</b><p>Swap movement for plain state changes.</p></div><input type="checkbox" className="switch" checked={prefs.reducedMotion} onChange={e => void setPrefs({ ...prefs, reducedMotion: e.target.checked })} /></label>
        <label className="row"><div><b>Open when I sign in</b><p>Windows app only. Off by default.</p></div><input type="checkbox" className="switch" checked={prefs.launchAtLogin} onChange={e => void setPrefs({ ...prefs, launchAtLogin: e.target.checked })} /></label>
        <div className="row"><div><b>Export</b><p>All active notes as one JSON file.</p></div><button className="ghost field" onClick={() => void exportAll()}>Export JSON</button></div>
        <div className="row col ai-set"><div><b>AI <Beta /></b><p>Optional. Pip works fully without it. {isNative() ? "Notes you run through AI are sent to ChatGPT or the provider you pick. A key you add is kept in Windows Credential Manager." : "Your key stays in this browser and requests go straight to the provider you pick.  Notes you run through AI are sent to that provider."}</p></div>
          {isNative() && (cg ? (
            <div className="cg" data-state="in"><div className="cg-who"><span className="cg-dot" aria-hidden /><div><b>{cg.active ? "Using your ChatGPT plan" : "ChatGPT connected"}</b><p>{cg.email}</p></div></div>
              <Dropdown label="Model" value={cg.model} placeholder="Choose a model" options={cgModels.map(m => ({ value: m.slug, label: m.name, hint: "" }))} onChange={v => void cgRun(() => chatGptUse(v))} />
              <div className="ai-act">{!cg.active && <button className="ghost field primary" disabled={cgBusy || !cg.model} onClick={() => void cgRun(() => chatGptUse(cg.model))}>Use ChatGPT <Beta /></button>}
                <button className="ghost danger" disabled={cgBusy} onClick={() => void cgRun(chatGptSignOut)}>Sign out <Beta /></button><span className="muted" role="status">{cgMsg}</span></div>
            </div>) : (
            <div className="cg" data-state="out"><button className="cg-btn" disabled={cgBusy} onClick={() => void cgRun(chatGptSignIn, "Finish signing in in your browser...")}>{cgBusy ? "Waiting for ChatGPT..." : "Continue with ChatGPT"} <Beta /></button>
              <p className="muted">Use your ChatGPT plan. No key to copy. Pip never sees your password or your chats.</p><span className="muted" role="status">{cgMsg}</span></div>))}
          {!cg?.active && (<>{isNative() && <p className="cg-or">Or use your own key</p>}
          <Dropdown label="Provider" value={PRESETS.find(pr => pr.baseUrl === aiBase)?.id ?? "custom"} placeholder="Custom"
            options={[...PRESETS.map(pr => ({ value: pr.id, label: pr.label, hint: pr.baseUrl.startsWith("http://") ? "no key" : "" })), { value: "custom", label: "Custom endpoint" }]}
            onChange={v => { const pr = PRESETS.find(x => x.id === v); setAiState(""); if (pr) { setAiBase(pr.baseUrl); setAiModel(pr.model); } else { setAiBase(""); setAiModel(""); } }} />
          <input aria-label="Base URL" placeholder="Base URL, e.g. https://api.openai.com/v1" value={aiBase} onChange={e => { setAiBase(e.target.value); setAiState(""); }} spellCheck={false} />
          <input aria-label="API key" type="password" autoComplete="off" placeholder={aiHasStoredKey() ? "Saved in Windows Credential Manager. Type to replace" : local ? "API key (not needed for local)" : "API key"} value={aiKey} onChange={e => { setAiKey(e.target.value); setAiState(""); }} />
          <input aria-label="Model" placeholder="Model, e.g. gpt-4o-mini" value={aiModel} onChange={e => { setAiModel(e.target.value); setAiState(""); }} spellCheck={false} />
          <div className="ai-act"><button className="ghost field" disabled={!aiReady} onClick={() => void saveAi(true)}>Test and save <Beta /></button>
            {(raw.key || raw.baseUrl) && <button className="ghost danger" onClick={() => { void setAiConfig(null); setAiBase(""); setAiKey(""); setAiModel(""); setAiState("AI is off. Key removed."); }}>Remove key <Beta /></button>}
            <span className="muted" role="status">{aiState}</span></div></>)}
        </div>
        <div className="row col"><div><b>Backups</b><p>One a day, last seven kept. Restoring saves your current notes first.</p></div>
          {backups.length === 0 ? <p className="muted">No backups yet.</p> : backups.filter(b => !b.day.includes("before-restore")).map(b => (
            <div className="bk" key={b.day}><span>{b.day}</span><span className="muted">{b.count} {b.count === 1 ? "note" : "notes"}</span>
              <button className="ghost" onClick={async () => { if (!confirm(`Restore ${b.day}? Your current notes are backed up first.`)) return; try { await repo.restoreBackup(b.day); onRestored(); setMsg("Restored."); } catch (e) { setMsg((e as Error).message); } }}>Restore</button></div>))}
        </div>
        {isNative() && <UpdateRow />}
      </div>
    </div>
  );
}

type Up = { s: "idle" | "checking" | "current" | "downloading" | "ready" | "error"; v?: string; err?: string };
/** Manual update. Nothing happens until the button is pressed. */
function UpdateRow() {
  const [u, setU] = useState<Up>({ s: "idle" });
  const run = async () => {
    if (u.s === "ready") { try { await updater.install(); } catch (e) { setU({ s: "error", err: String(e) }); } return; }
    if (u.s === "checking" || u.s === "downloading") return;
    setU({ s: "checking" });
    try {
      const v = await updater.check();
      if (!v) { setU({ s: "current" }); return; }
      setU({ s: "downloading", v });
      await updater.download(); setU({ s: "ready", v });
    } catch (e) { setU({ s: "error", err: String(e) }); }
  };
  const label = { idle: "Check for updates", checking: "Checking...", current: "You're up to date", downloading: "Downloading update...", ready: "Update ready - restart to apply", error: "Try again" }[u.s];
  const note = u.s === "ready" ? `Version ${u.v} is downloaded. Pip restarts to finish.` : u.s === "downloading" ? `Version ${u.v}` : u.s === "error" ? `Couldn't update: ${u.err}` : "Pip never updates by itself. Press the button when you want the newest version.";
  return (
    <div className="row" data-update={u.s}><div><b>Updates</b><p role="status" aria-live="polite">{note}</p></div>
      <button className={`ghost field${u.s === "ready" ? " primary" : ""}`} disabled={u.s === "checking" || u.s === "downloading"} onClick={() => void run()}>{label}</button></div>
  );
}

/** Who is signed in, whether the last sync worked, and sign out. */
function AccountRow() {
  const [st, setSt] = useState(syncStatus());
  const [ask, setAsk] = useState<"" | "confirm" | "force">(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  useEffect(() => onSyncStatus(setSt), []);
  const me = loadSession(); if (!me) return null;
  const when = st.at ? new Date(st.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const line = st.state === "syncing" ? "Syncing..." : st.state === "error" || st.state === "offline" ? st.message : st.state === "idle" ? `Synced at ${when}` : "Waiting to sync";
  const out = async () => {
    const id = me.user.id;
    try { await repo.wipeNotes(); } catch { /* the backup copy is made first; keep going */ }
    await signOut(); localStorage.removeItem(`pip.sync.cursor.${id}`); localStorage.removeItem(`pip.sync.push.${id}`); location.reload();
  };
  const start = async () => {
    setBusy(true); setMsg("Saving your latest notes...");
    try { await syncNow(); } catch { /* handled below */ }
    const r = syncStatus(); setBusy(false);
    if (r.state === "idle" || r.state === "off") { setMsg("Signing out..."); await out(); return; }
    setMsg(`Couldn't save your latest notes (${r.message || "offline"}).`); setAsk("force");
  };
  return (
    <div className="row col" data-sync={st.state}><div><b>Account</b><p>{me.user.email}</p></div>
      <div className="ai-act"><button className="ghost field" disabled={st.state === "syncing" || busy} onClick={() => void syncNow()}>Sync now</button>
        {ask === "" && <button className="ghost danger" onClick={() => { setMsg(""); setAsk("confirm"); }}>Sign out</button>}
        {ask === "confirm" && (<><span className="muted" role="status">Your notes are saved to your account first, then removed from this PC.</span>
          <button className="ghost danger" disabled={busy} onClick={() => void start()}>{busy ? "Saving..." : "Yes, sign out"}</button>
          <button className="ghost field" disabled={busy} onClick={() => { setAsk(""); setMsg(""); }}>Cancel</button></>)}
        {ask === "force" && (<><span className="muted" role="alert">{msg} Signing out now keeps a backup on this PC, but changes since the last sync won't reach your account.</span>
          <button className="ghost danger" onClick={() => void out()}>Sign out anyway</button>
          <button className="ghost field" onClick={() => { setAsk(""); setMsg(""); }}>Stay signed in</button></>)}
        {ask !== "force" && <span className="muted" role="status">{msg || line}</span>}</div></div>
  );
}

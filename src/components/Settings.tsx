import { useEffect, useState } from "react";
import type { Prefs, Theme } from "../domain";
import { repo } from "../useNotes";
import { PRESETS, complete, getAiRaw, normalizeBase, setAiConfig, validBase, AiError } from "../ai";

const keyName = (e: KeyboardEvent) => {
  const k = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  return [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Win", k].filter(Boolean).join("+");
};

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
  const local = /^http:\/\/(localhost|127\.0\.0\.1)/.test(aiBase.trim());
  const aiReady = validBase(aiBase) && !!aiModel.trim() && (!!aiKey.trim() || local);
  const saveAi = async (test: boolean) => {
    const cfg = { baseUrl: normalizeBase(aiBase), key: aiKey.trim(), model: aiModel.trim() };
    if (!test) { setAiConfig(cfg); setAiState("Saved on this device."); return; }
    setAiState("Testing");
    try { await complete(cfg, [{ role: "user", content: "Reply with the word ok." }], { maxTokens: 5, timeoutMs: 20000 }); setAiConfig(cfg); setAiState("Works. AI tools are on."); }
    catch (e) { setAiState(e instanceof AiError ? e.message : "Test failed."); }
  };
  const exportAll = async () => { const t = await repo.exportJson(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "application/json" })); a.download = "pip-notes.json"; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings">
        <header><h2>Settings</h2><button className="ghost" onClick={onClose}>Done</button></header>
        <label className="row"><div><b>Shake to capture</b><p>Shake the mouse side to side to open capture. Ignored while a button is held.</p></div><input type="checkbox" className="switch" checked={prefs.shakeToCapture} onChange={e => void setPrefs({ ...prefs, shakeToCapture: e.target.checked })} /></label>
        <div className="row"><div><b>Capture shortcut</b><p>Second way in, same panel.</p></div>
          <button className="ghost field" onClick={() => { setRec(true); setMsg("Press the new keys"); }}>{rec ? "Press keys" : prefs.shortcut}</button></div>
        {msg && <p className="status" role="status">{msg}</p>}
        <div className="row"><div><b>Theme</b></div>
          <div className="seg" role="radiogroup" aria-label="Theme">{(["system", "light", "dark"] as Theme[]).map(t => <button key={t} role="radio" aria-checked={prefs.theme === t} className={prefs.theme === t ? "on" : ""} onClick={() => void setPrefs({ ...prefs, theme: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div></div>
        <label className="row"><div><b>Reduce motion</b><p>Swap movement for plain state changes.</p></div><input type="checkbox" className="switch" checked={prefs.reducedMotion} onChange={e => void setPrefs({ ...prefs, reducedMotion: e.target.checked })} /></label>
        <label className="row"><div><b>Open when I sign in</b><p>Windows app only. Off by default.</p></div><input type="checkbox" className="switch" checked={prefs.launchAtLogin} onChange={e => void setPrefs({ ...prefs, launchAtLogin: e.target.checked })} /></label>
        <div className="row"><div><b>Export</b><p>All active notes as one JSON file.</p></div><button className="ghost field" onClick={() => void exportAll()}>Export JSON</button></div>
        <div className="row col ai-set"><div><b>AI (bring your own key)</b><p>Optional. Pip works fully without it. Your key stays in this browser and requests go straight to the provider you pick. Notes you run through AI are sent to that provider.</p></div>
          <div className="ai-presets" role="group" aria-label="Provider">{PRESETS.map(pr => <button key={pr.id} className={`ghost ${aiBase === pr.baseUrl ? "on" : ""}`} aria-pressed={aiBase === pr.baseUrl} onClick={() => { setAiBase(pr.baseUrl); setAiModel(pr.model); setAiState(""); }}>{pr.label}</button>)}</div>
          <input aria-label="Base URL" placeholder="Base URL, e.g. https://api.openai.com/v1" value={aiBase} onChange={e => { setAiBase(e.target.value); setAiState(""); }} spellCheck={false} />
          <input aria-label="API key" type="password" autoComplete="off" placeholder={local ? "API key (not needed for local)" : "API key"} value={aiKey} onChange={e => { setAiKey(e.target.value); setAiState(""); }} />
          <input aria-label="Model" placeholder="Model, e.g. gpt-4o-mini" value={aiModel} onChange={e => { setAiModel(e.target.value); setAiState(""); }} spellCheck={false} />
          <div className="ai-act"><button className="ghost field" disabled={!aiReady} onClick={() => void saveAi(true)}>Test and save</button>
            {(raw.key || raw.baseUrl) && <button className="ghost danger" onClick={() => { setAiConfig(null); setAiBase(""); setAiKey(""); setAiModel(""); setAiState("AI is off. Key removed."); }}>Remove key</button>}
            <span className="muted" role="status">{aiState}</span></div>
        </div>
        <div className="row col"><div><b>Backups</b><p>One a day, last seven kept. Restoring saves your current notes first.</p></div>
          {backups.length === 0 ? <p className="muted">No backups yet.</p> : backups.filter(b => !b.day.includes("before")).map(b => (
            <div className="bk" key={b.day}><span>{b.day}</span><span className="muted">{b.count} {b.count === 1 ? "note" : "notes"}</span>
              <button className="ghost" onClick={async () => { if (!confirm(`Restore ${b.day}? Your current notes are backed up first.`)) return; try { await repo.restoreBackup(b.day); onRestored(); setMsg("Restored."); } catch (e) { setMsg((e as Error).message); } }}>Restore</button></div>))}
        </div>
      </div>
    </div>
  );
}

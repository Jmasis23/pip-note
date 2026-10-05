import { useEffect, useMemo, useRef, useState } from "react";
import type { Prefs } from "../domain";
import { Icon } from "../icons/Icon";
import { WiggleRing } from "./WiggleRing";
import { loadLandmarks, resetLandmarks, saveLandmarks, type LandmarkState } from "./api";
import { clampRect, createWiggleTest, EDGE_PRESETS, MIN_SIDE, optsFromSensitivity, overlaps, TOOLS, toolLabel, validate, type Landmark, type Rect } from "./model";
import "./landmarks.css";

type Drag = { mode: "draw" | "move" | "resize"; id: string; start: { x: number; y: number }; orig: Rect; corner?: "nw" | "ne" | "sw" | "se"; moved: boolean };
const rid = () => `lm-${Math.random().toString(36).slice(2, 9)}`;

export function LandmarksSheet({ prefs, setPrefs, onClose }: { prefs: Prefs; setPrefs: (p: Prefs) => Promise<void>; onClose: () => void }) {
  const [state, setState] = useState<LandmarkState | null>(null);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Landmark[]>([]);
  const [saved, setSaved] = useState<Landmark[]>([]);
  const [mon, setMon] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [testing, setTesting] = useState(false);
  const [hit, setHit] = useState<{ id: string; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [ring, setRing] = useState<{ v: number; x: number; y: number } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const apply = (s: LandmarkState) => { setState(s); setItems(s.layout.landmarks); setSaved(s.layout.landmarks); setMon(m => m || s.layout.monitors[0]?.id || ""); };
  useEffect(() => { loadLandmarks().then(apply).catch(e => setError(String(e?.message ?? e))); }, []);

  const monitors = state?.layout.monitors ?? [];
  const monitor = monitors.find(m => m.id === mon);
  const here = items.filter(l => l.monitor_id === mon);
  const current = items.find(l => l.id === sel) ?? null;
  const dirty = JSON.stringify(items) !== JSON.stringify(saved);
  const review = items.filter(l => l.needs_review);
  const patch = (id: string, p: Partial<Landmark>) => setItems(a => a.map(l => l.id === id ? { ...l, ...p } : l));

  const t0 = useRef(performance.now());
  const tester = useMemo(() => createWiggleTest(
    () => (monitor ? here.filter(l => l.enabled && !l.needs_review).map(l => ({ id: l.id, r: [l.rect.x * monitor.w, l.rect.y * monitor.h, l.rect.w * monitor.w, l.rect.h * monitor.h] as [number, number, number, number] })) : []),
    () => optsFromSensitivity(prefs.shakeSens ?? 50), id => { setHit({ id, at: Date.now() }); setRing(null); }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [mon, items, prefs.shakeSens]);
  useEffect(() => { if (!hit) return; const t = window.setTimeout(() => setHit(null), 1800); return () => window.clearTimeout(t); }, [hit]);

  const frac = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  const onDown = (e: React.PointerEvent, id?: string, corner?: Drag["corner"]) => {
    if (testing || !monitor) return; e.stopPropagation(); canvas.current!.setPointerCapture(e.pointerId);
    const p = frac(e);
    if (id) { const l = items.find(x => x.id === id)!; setSel(id); drag.current = { mode: corner ? "resize" : "move", id, start: p, orig: l.rect, corner, moved: false }; return; }
    drag.current = { mode: "draw", id: rid(), start: p, orig: { x: p.x, y: p.y, w: 0, h: 0 }, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    if (testing) {
      const f = frac(e); setProblem(""); tester.move(f.x * monitor!.w, f.y * monitor!.h, performance.now() - t0.current, e.buttons > 0);
      const v = tester.progress(); const r = canvas.current!.getBoundingClientRect(); setRing(v > 0 ? { v, x: e.clientX - r.left, y: e.clientY - r.top } : null); return;
    }
    const d = drag.current; if (!d || !monitor) return;
    const p = frac(e), dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (!d.moved && Math.hypot(dx * canvas.current!.clientWidth, dy * canvas.current!.clientHeight) < 4) return; d.moved = true;
    let r: Rect;
    if (d.mode === "move") r = clampRect({ ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy });
    else if (d.mode === "resize") {
      const o = d.orig, c = d.corner!; let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (c.includes("w")) x1 = Math.min(x2 - MIN_SIDE, Math.max(0, o.x + dx)); else x2 = Math.max(x1 + MIN_SIDE, Math.min(1, o.x + o.w + dx));
      if (c.includes("n")) y1 = Math.min(y2 - MIN_SIDE, Math.max(0, o.y + dy)); else y2 = Math.max(y1 + MIN_SIDE, Math.min(1, o.y + o.h + dy));
      r = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    } else { const x = Math.max(0, Math.min(d.start.x, p.x)), y = Math.max(0, Math.min(d.start.y, p.y)); r = { x, y, w: Math.min(1, Math.max(d.start.x, p.x)) - x, h: Math.min(1, Math.max(d.start.y, p.y)) - y }; }
    setItems(a => a.some(l => l.id === d.id) ? a.map(l => l.id === d.id ? { ...l, rect: r, needs_review: false } : l)
      : [...a, { id: d.id, name: `Landmark ${a.filter(l => l.monitor_id === mon).length + 1}`, enabled: true, monitor_id: mon, rect: r, tool: "quick-capture" as const }]);
    setSel(d.id);
  };
  const onUp = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    setItems(a => {
      const l = a.find(x => x.id === d.id); if (!l) return a;
      const undo = () => d.mode === "draw" ? a.filter(x => x.id !== d.id) : a.map(x => x.id === d.id ? { ...x, rect: d.orig } : x);
      if (l.rect.w < MIN_SIDE || l.rect.h < MIN_SIDE) { setProblem("That region is too small to wiggle in. Draw it at least 3% of the screen wide and tall."); return undo(); }
      const clash = a.find(x => x.id !== l.id && x.monitor_id === l.monitor_id && overlaps(x.rect, l.rect));
      if (clash) { setProblem(`"${l.name}" overlaps "${clash.name}". Landmarks can't overlap, because Pip would not know which tool you meant. Move or resize one of them.`); return undo(); }
      setProblem(""); return a;
    });
  };
  const remove = (id: string) => { setItems(a => a.filter(l => l.id !== id)); setSel(null); setProblem(""); };
  const nudge = (e: React.KeyboardEvent) => {
    if (!current || testing) return; const step = e.shiftKey ? 0.02 : 0.005;
    const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key === "Delete") { e.preventDefault(); remove(current.id); return; }
    const v = m[e.key]; if (!v) return; e.preventDefault();
    const r = clampRect({ ...current.rect, x: current.rect.x + v[0], y: current.rect.y + v[1] });
    const clash = items.find(x => x.id !== current.id && x.monitor_id === current.monitor_id && overlaps(x.rect, r));
    if (clash) { setProblem(`"${current.name}" would overlap "${clash.name}". Landmarks can't overlap.`); return; }
    setProblem(""); patch(current.id, { rect: r, needs_review: false });
  };
  const addPreset = (slot: string) => {
    const p = EDGE_PRESETS.find(x => x.slot === slot)!; const clash = here.find(l => overlaps(l.rect, p.rect));
    if (clash) { setProblem(`${p.name} overlaps "${clash.name}". Move or delete that Landmark first.`); return; }
    const id = rid(); setItems(a => [...a, { id, name: p.name, enabled: true, monitor_id: mon, rect: p.rect, tool: "quick-capture" }]); setSel(id); setProblem("");
  };
  const save = async () => {
    const v = validate(items); if (v) { setProblem(v); return; }
    setBusy(true); setNote("");
    try { const l = await saveLandmarks(items); setSaved(l.landmarks); setItems(l.landmarks); setProblem(""); setNote("Saved."); } // shown only after the write returned
    catch (e: any) { setProblem(String(e?.message ?? e)); }
    setBusy(false);
  };
  const reset = async () => {
    if (!confirm("Replace all Landmarks with the default presets?")) return;
    setBusy(true); try { const l = await resetLandmarks(); setSaved(l.landmarks); setItems(l.landmarks); setSel(null); setProblem(""); setNote("Back to the presets."); } catch (e: any) { setProblem(String(e?.message ?? e)); } setBusy(false);
  };
  const close = () => { if (dirty && !confirm("Close without saving your Landmark changes?")) return; onClose(); };

  const statusText = !state ? "" : state.preview ? "Browser preview. The background listener only runs in the Windows app, so nothing here can open a tool while you work in another app."
    : state.status === "running" ? "Listening in the background." : state.status.startsWith("failed") ? `Pip couldn't start its mouse listener (${state.status.slice(8)}). Landmarks won't open tools until it restarts. Use ${prefs.shortcut} meanwhile.` : `Listener: ${state.status}.`;
  const sens = prefs.shakeSens ?? 50;
  const cw = canvas.current?.clientWidth ?? 0, ch = canvas.current?.clientHeight ?? 0;

  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) close(); }} onKeyDown={e => { if (e.key === "Escape") close(); }}>
      <div className="sheet lm-sheet" role="dialog" aria-modal="true" aria-label="Landmarks" tabIndex={-1} ref={el => { if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); }}>
        <header><div><h2>Landmarks</h2><p className="lm-sub">Invisible screen regions. Wiggle your cursor inside one to open its tool.</p></div><button className="ghost lm-ico" onClick={close} aria-label="Close"><Icon name="close" size={20} /></button></header>
        {error && <p className="lm-err" role="alert">Couldn't load Landmarks: {error}</p>}
        {!state && !error && <p className="lm-sub lm-pad">Loading…</p>}
        {state && <div className="lm-body">
          <p className={"lm-status" + (state.status.startsWith("failed") ? " bad" : "")} role="status">{statusText}</p>
          {review.length > 0 && <div className="lm-review" role="alert"><b>Your displays changed.</b> {review.length} Landmark{review.length > 1 ? "s" : ""} won't fire until you check {review.length > 1 ? "them" : "it"}. Select one, adjust it if needed, then Keep position.</div>}
          <div className="lm-tabs" role="tablist" aria-label="Monitors">{monitors.map((m, i) => <button key={m.id} role="tab" aria-selected={m.id === mon} className={m.id === mon ? "on" : ""} onClick={() => { setMon(m.id); setSel(null); }}>Monitor {i + 1}<small>{m.w}×{m.h} · {Math.round(m.scale * 100)}%</small></button>)}</div>
          {monitor && <div className="lm-stage">
            <div ref={canvas} className={"lm-screen" + (testing ? " testing" : "")} style={{ aspectRatio: `${monitor.w} / ${monitor.h}` }} role="application" aria-label={`Layout of monitor. Drag to draw a region${testing ? ". Test mode is on: wiggle inside a region." : ""}`} tabIndex={0}
              onPointerDown={e => onDown(e)} onPointerMove={onMove} onPointerLeave={() => { setRing(null); tester.reset(); }} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={nudge}>
              {here.map(l => <div key={l.id} className={"lm-r" + (l.id === sel ? " sel" : "") + (!l.enabled ? " off" : "") + (l.needs_review ? " review" : "") + (hit?.id === l.id ? " hit" : "")}
                style={{ left: `${l.rect.x * 100}%`, top: `${l.rect.y * 100}%`, width: `${l.rect.w * 100}%`, height: `${l.rect.h * 100}%` }} onPointerDown={e => onDown(e, l.id)}>
                <span className="lm-name">{l.name}</span><span className="lm-tool">{toolLabel(l.tool)}</span>
                {l.id === sel && !testing && (["nw", "ne", "sw", "se"] as const).map(c => <i key={c} className={"lm-h " + c} onPointerDown={e => onDown(e, l.id, c)} />)}
              </div>)}
              {here.length === 0 && !testing && <p className="lm-hint">No Landmarks on this monitor. Drag anywhere to draw one, or add a preset below.</p>}
              {testing && ring && <div className="lm-ring" style={{ left: ring.x > cw - 70 ? ring.x - 54 : ring.x, top: ring.y > ch - 70 ? ring.y - 54 : ring.y }}><WiggleRing value={ring.v} size={40} /></div>}
              {hit && <div className="lm-toast">Would open {toolLabel(items.find(l => l.id === hit.id)?.tool ?? "quick-capture")}</div>}
            </div>
            <p className="lm-cap">{testing ? "Test mode: wiggle left and right inside a region. An orange ring fills as you get close; when it completes, the tool would open. Nothing is saved or opened." : "Drag to draw. Drag a region to move it, corners to resize. Arrow keys nudge the selected region, Delete removes it."}</p>
          </div>}
          {problem && <p className="lm-err" role="alert">{problem}</p>}
          <div className="lm-row">
            <button className={"ghost field" + (testing ? " on" : "")} aria-pressed={testing} onClick={() => { setTesting(t => !t); tester.reset(); setRing(null); setProblem(""); }}><Icon name="scan" size={16} />{testing ? "Stop testing" : "Test wiggle"}</button>
            <label className="lm-sens">Sensitivity<input type="range" min={0} max={100} value={sens} aria-valuetext={`${sens} of 100`} onChange={e => void setPrefs({ ...prefs, shakeSens: Number(e.target.value) })} /><small>{sens < 40 ? "Firm" : sens > 60 ? "Light" : "Default"}</small></label>
          </div>
          <details className="lm-presets"><summary>Add an edge or corner preset</summary><div>{EDGE_PRESETS.map(p => <button key={p.slot} className="ghost field" onClick={() => addPreset(p.slot)}>{p.name}</button>)}</div></details>
          {current && <fieldset className="lm-edit"><legend>Selected Landmark</legend>
            <label>Name<input value={current.name} onChange={e => patch(current.id, { name: e.target.value })} maxLength={40} /></label>
            <label>Opens<select value={current.tool} onChange={e => patch(current.id, { tool: e.target.value as Landmark["tool"] })}>{TOOLS.map(t => <option key={t.id} value={t.id} disabled={!t.ready && t.id !== current.tool}>{t.label}{t.ready ? "" : " (not built yet)"}</option>)}</select></label>
            <label className="lm-check"><input type="checkbox" checked={current.enabled} onChange={e => patch(current.id, { enabled: e.target.checked })} />Enabled</label>
            {current.needs_review && <button className="ghost field" onClick={() => patch(current.id, { needs_review: false })}>Keep position</button>}
            <button className="ghost danger" onClick={() => remove(current.id)}><Icon name="trash" size={16} />Delete</button>
          </fieldset>}
          <footer className="lm-foot"><button className="ghost" onClick={() => void reset()} disabled={busy}>Reset to presets</button><span role="status" className="lm-note">{note}</span><button className="primary" disabled={!dirty || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save Landmarks"}</button></footer>
        </div>}
      </div>
    </div>
  );
}

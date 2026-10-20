import { useEffect, useState } from "react";
import { repo } from "../useNotes";
import { DEFAULT_PREFS, TEXT_STEPS, type TextSize } from "../domain";
import { TextStepper } from "./TextStepper";

/** The same -/+ text size control, wired straight to the saved preference so any text surface can show it. */
export function LiveTextStepper({ className = "" }: { className?: string }) {
  const [size, setSize] = useState<TextSize>(DEFAULT_PREFS.textSize);
  useEffect(() => {
    let live = true; const read = () => void repo.getPrefs().then(p => { if (live) setSize(p.textSize); });
    read(); window.addEventListener("pip:changed", read); return () => { live = false; window.removeEventListener("pip:changed", read); };
  }, []);
  const change = (v: TextSize) => {
    if (!TEXT_STEPS.includes(v)) return;
    setSize(v); document.documentElement.dataset.text = v;
    void repo.getPrefs().then(p => repo.setPrefs({ ...p, textSize: v })).then(() => window.dispatchEvent(new Event("pip:changed")));
  };
  return <TextStepper value={size} onChange={change} className={className} />;
}

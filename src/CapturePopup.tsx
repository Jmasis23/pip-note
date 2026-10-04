import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { Capture } from "./components/Capture";
import { initStorage, call, onNativeEvent, isNative } from "./native";
import type { TextSize } from "./domain";
import { repo } from "./useNotes";
import "@fontsource-variable/inter";
import "./dirs/b.css";

/** The small always-on-top box the shake and the hotkey open. It writes straight to the notes store and tells the main window. */
export default function CapturePopup() {
  const [round, setRound] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [size, setSize] = useState<TextSize>("m");
  useEffect(() => {
    document.documentElement.classList.add("cap-win");
    const theme = async () => {
      const p = await repo.getPrefs(); const mq = matchMedia("(prefers-color-scheme: dark)");
      const d = document.documentElement.dataset; d.theme = p.theme === "dark" || (p.theme === "system" && mq.matches) ? "dark" : "light"; d.accent = p.accent; d.text = p.textSize; setSize(p.textSize); setReducedMotion(p.reducedMotion); d.motion = p.reducedMotion ? "reduced" : "full";
    };
    void theme();
    let off = () => {}; let dead = false;
    if (isNative()) void onNativeEvent("pip://capture-show", () => { void (async () => { await initStorage(); await theme(); setRound(r => r + 1); })(); }).then(f => { if (dead) f(); else off = f; });
    // Native move/resize and system menus can blur the WebView. Only explicit dismissal closes capture.
    return () => { dead = true; off(); };
  }, []);
  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}><div className="db db-pop">
      <Capture key={round} textSize={size} onTextSize={v => { setSize(v); document.documentElement.dataset.text = v; void repo.getPrefs().then(p => repo.setPrefs({ ...p, textSize: v })).then(() => isNative() && call("prefs_changed")); }} open onClose={() => isNative() && void call("capture_hide")} onSaved={() => isNative() && void call("capture_saved")} />
    </div></MotionConfig>
  );
}

import { useEffect, useState } from "react";
import { Capture } from "./components/Capture";
import { initStorage, call, onNativeEvent } from "./native";
import { repo } from "./useNotes";
import "@fontsource-variable/bricolage-grotesque";
import "./dirs/b.css";

/** The small always-on-top box the shake and the hotkey open. It writes straight to the notes store and tells the main window. */
export default function CapturePopup() {
  const [round, setRound] = useState(0);
  const [live, setLive] = useState(false);
  useEffect(() => {
    document.documentElement.classList.add("cap-win");
    const theme = async () => {
      const p = await repo.getPrefs(); const mq = matchMedia("(prefers-color-scheme: dark)");
      const d = document.documentElement.dataset; d.theme = p.theme === "dark" || (p.theme === "system" && mq.matches) ? "dark" : "light"; d.accent = p.accent; d.motion = p.reducedMotion ? "reduced" : "full";
    };
    void theme();
    let off = () => {}; let dead = false;
    void onNativeEvent("pip://capture-show", () => { void (async () => { await initStorage(); await theme(); setRound(r => r + 1); setLive(true); })(); }).then(f => { if (dead) f(); else off = f; });
    const blur = () => { if (live) window.dispatchEvent(new Event("pip-dismiss")); };
    window.addEventListener("blur", blur);
    return () => { dead = true; off(); window.removeEventListener("blur", blur); };
  }, [live]);
  return (
    <div className="db db-pop">
      <Capture key={round} open onClose={() => void call("capture_hide")} onSaved={() => void call("capture_saved")} />
    </div>
  );
}

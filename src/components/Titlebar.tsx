import { useEffect, useState } from "react";
import { call } from "../native";
import { PipWord } from "./Pip";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

// Desktop only. The window has no native frame, so this bar is the drag handle and the window buttons.
export function Titlebar() {
  const [max, setMax] = useState(false);
  useEffect(() => {
    const sync = () => { void call<boolean>("win_is_max").then(setMax).catch(() => {}); };
    sync(); window.addEventListener("resize", sync); return () => window.removeEventListener("resize", sync);
  }, []);
  const toggle = () => { void call<boolean>("win_toggle_max").then(setMax).catch(() => {}); };
  return (
    <div className="tb" data-tauri-drag-region>
      <div className="tb-id" data-tauri-drag-region><PipWord height={15} /></div>
      <div className="tb-ctl">
        <button aria-label="Minimize" onClick={() => void call("win_minimize")}>
          <svg width="10" height="10" viewBox="0 0 10 10" {...stroke}><path d="M1 5.5h8" /></svg>
        </button>
        <button aria-label={max ? "Restore" : "Maximize"} onClick={toggle}>
          {max
            ? <svg width="10" height="10" viewBox="0 0 10 10" {...stroke}><rect x="1" y="3" width="6" height="6" rx="1.2" /><path d="M3 3V2.2C3 1.5 3.5 1 4.2 1H7.8C8.5 1 9 1.5 9 2.2V5.8C9 6.5 8.5 7 7.8 7H7" /></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10" {...stroke}><rect x="1" y="1" width="8" height="8" rx="1.8" /></svg>}
        </button>
        <button className="tb-x" aria-label="Close to tray" onClick={() => void call("win_close")}>
          <svg width="10" height="10" viewBox="0 0 10 10" {...stroke}><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { WiggleRing } from "./WiggleRing";
import "./landmarks.css";
/** Content of the native meter window (?meter=1). Rust shows/hides and positions the window; this only draws the ring. */
export default function Meter() {
  const [v, setV] = useState(0);
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    let off: (() => void) | undefined,
      dead = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<number>("pip://meter", (e) => setV(Number(e.payload) || 0)),
      )
      .then((f) => {
        if (dead) f();
        else off = f;
      });
    return () => {
      dead = true;
      off?.();
    };
  }, []);
  return (
    <div className="wring-host">
      <WiggleRing value={v} />
    </div>
  );
}

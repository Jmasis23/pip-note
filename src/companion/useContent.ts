import { useEffect, useState, useCallback } from "react";
import { content } from "./storage";
import { empty, type Snapshot } from "./model";
import { isNative } from "../native";
export function useContent() {
  const [data, setData] = useState<Snapshot>(empty());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setData(await content.load());
      setLoaded(true);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
    let dead = false;
    let off = () => {};
    if (isNative())
      void import("@tauri-apps/api/event")
        .then(({ listen }) =>
          listen("pip://content-changed", () => void refresh()),
        )
        .then((f) => {
          if (dead) f();
          else off = f;
        });
    const f = () => void refresh();
    window.addEventListener("pip:content", f);
    window.addEventListener("storage", f);
    return () => {
      dead = true;
      off();
      window.removeEventListener("pip:content", f);
      window.removeEventListener("storage", f);
    };
  }, [refresh]);
  return { data, loaded, error, refresh };
}

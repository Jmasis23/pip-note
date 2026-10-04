import { useEffect, useState } from "react";
import type { Draft, Note, View } from "../domain";
import { Home } from "./Home";

type Props = {
  name?: string; notes: Note[]; drafts: Draft[]; loaded: boolean; shortcut: string;
  onCapture: (draftId?: string) => void; onOpen: (id: string) => void; onView: (view: View) => void;
};

/** Home: a customizable widget bento. Keeps "now" fresh for the date and week tiles. */
export function Dashboard(props: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  return <Home {...props} now={now} />;
}

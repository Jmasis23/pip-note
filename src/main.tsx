import { createRoot } from "react-dom/client";
import { initStorage } from "./native";
import { initAi } from "./ai";
import { seedIfAsked } from "./seed";
import "./styles.css";

async function boot() {
  seedIfAsked();
  try { await initStorage(); await initAi(); } catch (e) { console.error("native init failed", e); }
  if (new URLSearchParams(location.search).has("capture")) {
    const { default: Pop } = await import("./CapturePopup");
    createRoot(document.getElementById("root")!).render(<Pop />); return;
  }
  const { default: Desk } = await import("./dirs/DirB");
  createRoot(document.getElementById("root")!).render(<Desk />);
}
void boot();

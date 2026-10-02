import { createRoot } from "react-dom/client";
import { initStorage } from "./native";
import { initAi } from "./ai";
import { seedIfAsked } from "./seed";
import "./styles.css";

async function boot() {
  seedIfAsked();
  try { await initStorage(); await initAi(); } catch (e) { console.error("native init failed", e); }
  const { default: Desk } = await import("./dirs/DirB");
  createRoot(document.getElementById("root")!).render(<Desk />);
}
void boot();

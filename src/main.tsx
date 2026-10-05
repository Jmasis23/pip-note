import { createRoot } from "react-dom/client";
import { initStorage } from "./native";
import { seedIfAsked } from "./seed";
import "./styles.css";

async function boot() {
  seedIfAsked(import.meta.env.VITE_PREVIEW === "true");
  try { await initStorage(); } catch (e) { console.error("native init failed", e); }
  if (new URLSearchParams(location.search).has("meter")) {
    const { default: M } = await import("./landmarks/Meter");
    createRoot(document.getElementById("root")!).render(<M />); return;
  }
  if (new URLSearchParams(location.search).has("ref")) {
    const { default: R } = await import("./ReferenceWindow");
    createRoot(document.getElementById("root")!).render(<R />); return;
  }
  if (new URLSearchParams(location.search).has("tool")) {
    const { default: T } = await import("./ToolWindow");
    createRoot(document.getElementById("root")!).render(<T />); return;
  }
  if (new URLSearchParams(location.search).has("capture")) {
    const { default: Pop } = await import("./CapturePopup");
    createRoot(document.getElementById("root")!).render(<Pop />); return;
  }
  const { default: Desk } = await import("./dirs/DirB");
  const q = new URLSearchParams(location.search);
  // Design preview only (VITE_PREVIEW at build time): no account, local sample notes. ?gate shows the sign-in screens, ?empty the first-run state.
  if (import.meta.env.VITE_PREVIEW === "true" && !("__TAURI_INTERNALS__" in window) && !q.has("gate")) {
    if (!localStorage.getItem("pip.session.v1")) localStorage.setItem("pip.session.v1", JSON.stringify({ access_token: "preview", refresh_token: "preview", expires_at: 4102444800, user: { id: "preview", email: "preview@pip.invalid", name: "Joe" } }));
    createRoot(document.getElementById("root")!).render(<Desk />); return;
  }
  const { default: Gate } = await import("./cloud/Gate");
  createRoot(document.getElementById("root")!).render(<Gate><Desk /></Gate>);
}
void boot();

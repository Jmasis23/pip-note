import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { seedIfAsked } from "./seed";
seedIfAsked();
const d = new URLSearchParams(location.search).get("d");
const Root = d === "a" ? lazy(() => import("./dirs/DirA")) : d === "b" ? lazy(() => import("./dirs/DirB")) : d === "c" ? lazy(() => import("./dirs/DirC"))
  : lazy(async () => { await import("./styles.css"); return import("./App"); });
if (d) void import("./styles.css");
createRoot(document.getElementById("root")!).render(<Suspense fallback={null}><Root /></Suspense>);

import { DEFAULT_PREFS } from "./domain";
export function seedIfAsked(preview = false) {
  const q = new URLSearchParams(location.search);
  if (preview && q.has("empty")) { localStorage.removeItem("pip.store.v1"); return; }
  if (!(q.has("seed") || preview) || "__TAURI_INTERNALS__" in window) return;
  if (localStorage.getItem("pip.store.v1") && !new URLSearchParams(location.search).has("reseed")) return;
  const t = Date.now(), h = 3600e3;
  const n = (i: number, title: string, body: string, ago: number, pinned = false, cl: [string, boolean][] = []) => ({ id: "n" + i, title, body, checklist: cl.map(([text, done], k) => ({ id: `c${i}${k}`, text, done })), createdAt: t - ago * h, updatedAt: t - ago * h, pinned, deletedAt: null, revision: 1 });
  localStorage.setItem("pip.store.v1", JSON.stringify({ v: 1, draft: null, prefs: { ...DEFAULT_PREFS, theme: "light" }, notes: [
    n(1, "Landing page idea", "Hero shows the cursor catching a thought mid-air. One line of copy, no more.\nPeach only as a quiet highlight.", 0.3, true, [["Sketch three hero options", true], ["Ask Mia about the logo mark", false]]),
    n(2, "Groceries", "oat milk, lemons, stamps, the good olive oil", 1.2, false, [["Oat milk", false], ["Lemons", true]]),
    n(3, "Call Dr. Reyes", "Thursday after 2pm. Ask about the referral letter and whether the lab results came in.", 2.5),
    n(4, "Shortcut conflicts", "Check Ctrl+Shift+Space against the IME switcher on Windows 11. Shake gesture needs a dead zone near the taskbar.", 5, true),
    n(5, "Book ideas", "Designing Interfaces\nThe Elements of Typographic Style\nA Pattern Language", 26),
    n(6, "Trip to Lisbon", "Flights under 400. Stay near Alfama. Book the tram 28 early.", 30, false, [["Passport renewal", false], ["Book flights", false], ["Pastéis de Belém", false]]),
    n(7, "Standup notes", "Shipped capture panel. Backups next. Ask about Windows runner for the installer.", 52),
  ] }));
}

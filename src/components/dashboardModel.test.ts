import { describe, expect, it } from "vitest";
import type { Note } from "../domain";
import { dashboardModel, greeting } from "./dashboardModel";

const now = new Date(2026, 9, 4, 12).getTime();
const yesterday = new Date(2026, 9, 3, 12).getTime();
const note = (id: string, patch: Partial<Note> = {}): Note => ({ id, title: id, body: "", checklist: [], createdAt: yesterday, updatedAt: yesterday, deletedAt: null, pinned: false, revision: 1, ...patch });

describe("personal dashboard", () => {
  it("greets by first display name and handles missing names", () => {
    expect(greeting("  Alex Rivera ")).toBe("Hi, Alex");
    expect(greeting()).toBe("Hi there");
    expect(greeting("   ")).toBe("Hi there");
  });
  it("excludes trashed notes from every summary", () => {
    const result = dashboardModel([note("gone", { deletedAt: now, pinned: true, updatedAt: now, checklist: [{ id: "1", text: "Private", done: false }] })], now);
    expect(result).toEqual({ total: 0, today: 0, openItems: 0, pinned: [], recent: [], unfinished: [] });
  });
  it("counts notes created or edited on the local calendar day once", () => {
    const midnight = new Date(2026, 9, 4).getTime();
    const result = dashboardModel([note("edited", { updatedAt: midnight }), note("created", { createdAt: now, updatedAt: now }), note("old", { updatedAt: midnight - 1 })], now);
    expect(result.today).toBe(2);
  });
  it("sorts recent notes by editing time independently of pin status and limits previews", () => {
    const notes = Array.from({ length: 7 }, (_, i) => note(String(i), { updatedAt: now + i, pinned: i < 4 }));
    const result = dashboardModel(notes, now);
    expect(result.recent.map(n => n.id)).toEqual(["6", "5", "4", "3"]);
    expect(result.pinned.map(n => n.id)).toEqual(["3", "2", "1"]);
    expect(result.total).toBe(7);
  });
  it("counts individual unfinished items but shows only notes with work remaining", () => {
    const result = dashboardModel([
      note("mixed", { checklist: [{ id: "1", text: "Done", done: true }, { id: "2", text: "Next", done: false }, { id: "3", text: "Later", done: false }] }),
      note("complete", { checklist: [{ id: "4", text: "Done", done: true }] }),
    ], now);
    expect(result.openItems).toBe(2);
    expect(result.unfinished.map(n => n.id)).toEqual(["mixed"]);
  });
});

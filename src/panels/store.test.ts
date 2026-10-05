import { describe, expect, it, vi } from "vitest";
import { isOverdue, localDate, readList, type Followup } from "./store";
const f = (o: Partial<Followup>): Followup => ({ id: "1", text: "x", due: "", done: false, createdAt: 0, ...o });
describe("follow-ups", () => {
  const today = new Date(2026, 9, 5);
  it("overdue only when due before today and not done", () => {
    expect(isOverdue(f({ due: "2026-10-04" }), today)).toBe(true);
    expect(isOverdue(f({ due: "2026-10-05" }), today)).toBe(false);
    expect(isOverdue(f({ due: "2026-10-04", done: true }), today)).toBe(false);
    expect(isOverdue(f({}), today)).toBe(false);
  });
  it("formats local dates", () => { expect(localDate(today)).toBe("2026-10-05"); });
  it("ignores corrupt storage", () => { vi.stubGlobal("localStorage", { getItem: () => "{nope", setItem: () => {} }); expect(readList("followups")).toEqual([]); });
});

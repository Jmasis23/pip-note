import { describe, expect, it } from "vitest";
import { cleanRewrite, parsePlan, askMessages } from "./plan";

const now = new Date("2026-10-05T09:00:00").getTime();
const known = new Set(["n1"]);

describe("parsePlan", () => {
  it("reads clean JSON and local times", () => {
    const p = parsePlan(JSON.stringify({ say: "Done.", actions: [{ type: "reminder", text: "Call Dr. Reyes", at: "2026-10-06T15:00", noteId: "n1" }] }), now, known);
    expect(p.actions).toHaveLength(1);
    expect(p.actions[0]).toMatchObject({ type: "reminder", text: "Call Dr. Reyes", noteId: "n1" });
    expect(new Date((p.actions[0] as { at: number }).at).getHours()).toBe(15);
  });
  it("finds JSON inside a fenced reply", () => {
    const p = parsePlan("```json\n{\"say\":\"ok\",\"actions\":[{\"type\":\"create_note\",\"title\":\"Lisbon\",\"body\":\"\",\"checklist\":[\"Passport\",\"Charger\"]}]}\n```", now, known);
    expect(p.actions[0]).toMatchObject({ type: "create_note", title: "Lisbon", checklist: ["Passport", "Charger"] });
  });
  it("drops past, far-future and malformed reminders", () => {
    const p = parsePlan(JSON.stringify({ actions: [{ type: "reminder", text: "a", at: "2020-01-01T10:00" }, { type: "reminder", text: "b", at: "2031-01-01T10:00" }, { type: "reminder", text: "c", at: "soon" }, { type: "reminder", text: "", at: "2026-10-06T10:00" }] }), now, known);
    expect(p.actions).toEqual([]);
    expect(p.say).toMatch(/safe/);
  });
  it("never accepts an invented note id", () => {
    const p = parsePlan(JSON.stringify({ say: "x", actions: [{ type: "rewrite", noteId: "ghost", body: "new" }, { type: "reminder", text: "t", at: "2026-10-06T10:00", noteId: "ghost" }] }), now, known);
    expect(p.actions).toHaveLength(1);
    expect((p.actions[0] as { noteId?: string }).noteId).toBeUndefined();
  });
  it("caps actions and ignores unknown types", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ type: "create_note", title: `n${i}`, body: "b" }));
    expect(parsePlan(JSON.stringify({ actions: [...many, { type: "delete_everything" }] }), now, known).actions).toHaveLength(5);
  });
  it("treats plain prose as an answer", () => {
    expect(parsePlan("You have three open lists.", now, known)).toEqual({ say: "You have three open lists.", actions: [] });
  });
});
describe("cleanRewrite", () => {
  it("strips fences, prefaces and wrapping quotes", () => {
    expect(cleanRewrite("Here's the rewrite:\n\"Call Mia today.\"")).toBe("Call Mia today.");
    expect(cleanRewrite("```\nBuy milk\n```")).toBe("Buy milk");
  });
});
describe("askMessages", () => {
  it("includes the clock and the note ids", () => {
    const m = askMessages("hi", now, [{ id: "n1", title: "Groceries", updatedAt: 1 }]);
    expect(m[0].content).toContain("2026-10-05T09:00"); expect(m[0].content).toContain("n1 | Groceries");
  });
});
import { localSuggestions, parseSuggestions } from "./plan";
describe("suggestions", () => {
  it("keeps only valid reminder and folder suggestions with known ids", () => {
    const out = parseSuggestions(JSON.stringify({ suggestions: [
      { why: "Dentist is Friday", action: { type: "reminder", text: "Dentist", at: "2026-10-08T09:00", noteId: "n1" } },
      { why: "Loose note", action: { type: "folder", noteId: "n1", folder: "Travel" } },
      { why: "bad", action: { type: "folder", noteId: "ghost", folder: "X" } },
      { why: "bad", action: { type: "delete", noteId: "n1" } },
      { why: "", action: { type: "folder", noteId: "n1", folder: "Y" } },
    ] }), now, known);
    expect(out.map(s => s.action.type)).toEqual(["reminder", "folder"]);
  });
  it("suggests a nudge for a stale checklist, offline", () => {
    const s = localSuggestions([{ id: "n1", title: "Trip", body: "", open: ["a", "b"], ageDays: 5 }, { id: "n2", title: "New", body: "", open: ["a", "b"], ageDays: 0 }], now);
    expect(s).toHaveLength(1); expect(s[0].action).toMatchObject({ type: "reminder", noteId: "n1" });
  });
});
import { snapWeekday } from "./plan";
describe("snapWeekday", () => {
  it("moves a wrong date to the weekday the words name", () => {
    const wed = new Date("2026-10-07T15:00").getTime();
    expect(new Date(snapWeekday(wed, "Dentist Friday 3pm", now)).toDateString()).toBe("Fri Oct 09 2026");
  });
  it("leaves matching or ambiguous dates alone", () => {
    const fri = new Date("2026-10-09T15:00").getTime();
    expect(snapWeekday(fri, "Friday", now)).toBe(fri);
    expect(snapWeekday(fri, "Monday or Tuesday", now)).toBe(fri);
    expect(snapWeekday(fri, "call Mia", now)).toBe(fri);
  });
});

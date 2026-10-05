import { describe, expect, it } from "vitest";
import type { Note } from "../domain";
import { recallResults } from "./recall";
const note = (o: Partial<Note>): Note => ({ id: "n", title: "", body: "", checklist: [], createdAt: 0, updatedAt: 0, pinned: false, deletedAt: null, revision: 1, ...o });
const sn = (id: string, name: string, text: string, updatedAt = 0) => ({ id, name, text, updatedAt });
describe("recallResults", () => {
  it("empty query shows newest notes and snippets, capped at 8", () => {
    const notes = Array.from({ length: 12 }, (_, i) => note({ id: "n" + i, title: "T" + i, updatedAt: i }));
    const r = recallResults(notes, [sn("s", "Sig", "Best")], ""); expect(r).toHaveLength(8); expect(r[0].title).toBe("T11");
  });
  it("snippets whose name matches come first", () => {
    const r = recallResults([note({ id: "a", title: "Invoice draft", body: "x" })], [sn("s", "Invoice footer", "Pay in 30 days")], "invoice"); expect(r.map(x => x.kind)).toEqual(["snippet", "note"]);
  });
  it("hides trashed notes and matches body text", () => {
    const r = recallResults([note({ id: "a", body: "oat milk", deletedAt: 5 }), note({ id: "b", body: "buy oat milk" })], [], "oat"); expect(r.map(x => x.id)).toEqual(["b"]);
  });
  it("untitled notes get a title from the first line", () => { expect(recallResults([note({ body: "first line\nsecond" })], [], "")[0].title).toBe("first line"); });
});
import { projectShelves } from "./recall";
describe("projectShelves", () => {
  it("groups by top-level folder, skips unfiled and trashed, most recent project first", () => {
    const s = projectShelves([note({ id: "a", folder: "Work/Clients", updatedAt: 5 }), note({ id: "b", folder: "Work", updatedAt: 9 }), note({ id: "c", folder: "Home", updatedAt: 20 }), note({ id: "d", updatedAt: 99 }), note({ id: "e", folder: "Home", updatedAt: 99, deletedAt: 1 })]);
    expect(s.map(x => x.folder)).toEqual(["Home", "Work"]); expect(s[1].notes.map(n => n.id)).toEqual(["b", "a"]);
  });
});

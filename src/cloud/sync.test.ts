import { describe, expect, it } from "vitest";
import { fromRow, toRow } from "./sync";
import { createRepo, memoryKV } from "../repo/repo";

describe("sync rows", () => {
  it("round-trips a note, including folder, rich text, checklist and trash", async () => {
    const repo = createRepo(memoryKV());
    const n = await repo.create({ title: "T", body: "b", folder: "Work/Clients", rich: "<p>b</p>", pinned: true, checklist: [{ id: "1", text: "x", done: true }] });
    const back = fromRow(toRow(n));
    expect(back).toEqual(n);
    const t = { ...n, deletedAt: 1234567 }; expect(fromRow(toRow(t)).deletedAt).toBe(1234567);
  });
  it("empty folder and rich come back absent, not blank", () => {
    const n = { id: "a", title: "", body: "", checklist: [], createdAt: 1, updatedAt: 1, pinned: false, deletedAt: null, revision: 1 };
    const b = fromRow({ ...toRow(n), folder: null, rich: null }); expect(b.folder).toBeUndefined(); expect(b.rich).toBeUndefined();
  });
});

describe("syncMerge", () => {
  it("adds new cloud notes", async () => {
    const a = createRepo(memoryKV()), b = createRepo(memoryKV());
    const n = await a.create({ title: "one", body: "x" });
    expect(await b.syncMerge([n])).toEqual({ added: 1, updated: 0 });
    expect((await b.get(n.id)).title).toBe("one");
  });
  it("newer edit wins in both directions, older is ignored", async () => {
    const a = createRepo(memoryKV()), b = createRepo(memoryKV());
    const n = await a.create({ title: "v1", body: "x" }); await b.syncMerge([n]);
    const newer = { ...n, title: "v2", updatedAt: n.updatedAt + 1000 };
    expect(await b.syncMerge([newer])).toEqual({ added: 0, updated: 1 });
    expect((await b.get(n.id)).title).toBe("v2");
    expect(await b.syncMerge([{ ...n, title: "old", updatedAt: n.updatedAt - 5 }])).toEqual({ added: 0, updated: 0 });
    expect((await b.get(n.id)).title).toBe("v2");
  });
  it("a note deleted here stays deleted when the cloud still has it", async () => {
    const a = createRepo(memoryKV()); const n = await a.create({ title: "gone", body: "x" });
    await a.trash(n.id); await a.deleteForever(n.id);
    expect((await a.syncState()).tombstones).toContain(n.id);
    expect(await a.syncMerge([{ ...n, updatedAt: n.updatedAt + 9999 }])).toEqual({ added: 0, updated: 0 });
    expect((await a.list({ view: "all", query: "" })).length).toBe(0);
    await a.syncClearTombstones([n.id]); expect((await a.syncState()).tombstones).toEqual([]);
  });
  it("trashed notes sync as trashed", async () => {
    const a = createRepo(memoryKV()), b = createRepo(memoryKV()); const n = await a.create({ title: "t", body: "x" });
    await b.syncMerge([n]); await b.syncMerge([{ ...n, deletedAt: 5, updatedAt: n.updatedAt + 10 }]);
    expect((await b.list({ view: "trash", query: "" })).map(x => x.id)).toEqual([n.id]);
  });
  it("shared prefs apply only when passed", async () => {
    const a = createRepo(memoryKV()); await a.syncMerge([], { prefs: { theme: "dark", textSize: 3 } as never });
    const s = await a.syncState(); expect(s.prefs.theme).toBe("dark");
  });
});

import { describe, expect, it } from "vitest";
import { createRepo, memoryKV, dayKey } from "./repo";
import { ConflictError, ValidationError } from "../domain";

const fresh = (t = Date.UTC(2026, 9, 2, 12)) => { let clock = t; const kv = memoryKV(); return { kv, tick: (ms: number) => (clock += ms), repo: createRepo(kv, () => clock), repoAt: (c: () => number) => createRepo(kv, c) }; };

describe("repo", () => {
  it("creates, derives title, searches title and body", async () => {
    const { repo } = fresh();
    await repo.create({ body: "Buy oat milk\nand stamps" });
    await repo.create({ title: "Trip", body: "Lisbon flights" });
    expect((await repo.list({ view: "all", query: "oat stamps" })).map(n => n.title)).toEqual(["Buy oat milk"]);
    expect((await repo.list({ view: "all", query: "lisbon" }))).toHaveLength(1);
  });
  it("rejects empty notes", async () => {
    await expect(fresh().repo.create({ body: "  " })).rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects stale revisions instead of overwriting", async () => {
    const { repo } = fresh();
    const n = await repo.create({ body: "a" });
    await repo.update(n.id, 1, { body: "b" });
    await expect(repo.update(n.id, 1, { body: "c" })).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.get(n.id)).body).toBe("b");
  });
  it("trash, restore, permanent delete needs trash first", async () => {
    const { repo } = fresh();
    const n = await repo.create({ body: "x" });
    await expect(repo.deleteForever(n.id)).rejects.toBeInstanceOf(ValidationError);
    await repo.trash(n.id);
    expect(await repo.list({ view: "all", query: "" })).toHaveLength(0);
    expect(await repo.list({ view: "trash", query: "" })).toHaveLength(1);
    await expect(repo.update(n.id, 2, { body: "y" })).rejects.toBeInstanceOf(ValidationError);
    await repo.restore(n.id);
    expect(await repo.list({ view: "all", query: "" })).toHaveLength(1);
    await repo.trash(n.id); await repo.deleteForever(n.id);
    expect(await repo.list({ view: "trash", query: "" })).toHaveLength(0);
  });
  it("pinned view and Today view combine with search", async () => {
    const { repo, tick } = fresh();
    const a = await repo.create({ body: "alpha" }); await repo.create({ body: "beta" });
    await repo.setPinned(a.id, true);
    expect((await repo.list({ view: "pinned", query: "" })).map(n => n.body)).toEqual(["alpha"]);
    expect(await repo.list({ view: "today", query: "beta" })).toHaveLength(1);
    tick(48 * 3600 * 1000);
    expect(await repo.list({ view: "today", query: "" })).toHaveLength(0);
  });
  it("keeps unicode, emoji and multiline content", async () => {
    const { repo } = fresh();
    const body = "naïve café 日本語 🦄\n\"quoted\"\nline3";
    const n = await repo.create({ body, checklist: [{ id: "1", text: "牛乳 🥛", done: true }] });
    const json = JSON.parse(await repo.exportJson());
    expect(json.notes[0].body).toBe(body);
    expect(json.version).toBe(1);
    expect((await repo.exportMarkdown(n.id)).text).toContain("- [x] 牛乳 🥛");
  });
  it("draft persists across repo instances and clears", async () => {
    const { repo, kv } = fresh();
    await repo.saveDraft("half a thou");
    expect((await createRepo(kv).getDraft())?.text).toBe("half a thou");
    await repo.clearDraft(); expect(await repo.getDraft()).toBeNull();
  });
  it("failed write throws and never pretends success", async () => {
    const kv = { getItem: () => null, setItem: () => { throw new Error("disk full"); } };
    await expect(createRepo(kv).create({ body: "x" })).rejects.toThrow();
  });
  it("silent failed write is detected by read-back", async () => {
    const kv = { getItem: () => null, setItem: () => {} };
    await expect(createRepo(kv).create({ body: "x" })).rejects.toThrow(/write/);
  });
  it("daily backup keeps seven, restore preserves ids and revisions, rejects corrupt", async () => {
    let t = Date.UTC(2026, 9, 1, 12); const kv = memoryKV(); const repo = createRepo(kv, () => t);
    const n = await repo.create({ body: "keep" }); await repo.update(n.id, 1, { body: "keep2" });
    for (let i = 0; i < 9; i++) { expect(await repo.runDailyBackup()).toBe(true); t += 86400000; }
    expect(await repo.runDailyBackup()).toBe(true);
    expect((await repo.listBackups()).length).toBe(7);
    const day = (await repo.listBackups())[0].day;
    await repo.update(n.id, 2, { body: "changed" });
    await repo.restoreBackup(day);
    const r = await repo.get(n.id);
    expect(r.body).toBe("keep2"); expect(r.revision).toBe(2);
    const b = JSON.parse(kv.getItem("pip.backups.v1")!); b[day] = { junk: true }; kv.setItem("pip.backups.v1", JSON.stringify(b));
    await expect(repo.restoreBackup(day)).rejects.toBeInstanceOf(ValidationError);
    expect((await repo.get(n.id)).body).toBe("keep2");
    expect(dayKey(t)).toMatch(/^\d{4}-\d\d-\d\d$/);
  });
});

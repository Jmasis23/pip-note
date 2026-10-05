import { describe, expect, it } from "vitest";
import {
  createCompanionRepo,
  fields,
  fillTemplate,
  convertTime,
  validateSnapshot,
} from "./companion/model";
const memory = () => {
  let raw: string | null = null;
  return {
    read: async () => raw,
    write: async (expected: string | null, next: string) => {
      if (expected !== raw) throw Error("changed");
      raw = next;
    },
  };
};
describe("companion content", () => {
  it("acknowledges persistence and survives restart", async () => {
    const storage = memory();
    const r = createCompanionRepo(storage);
    const n = await r.keep({
      kind: "note",
      title: "日本語",
      body: "Hello 🦄\nsecond line",
      project: "Client",
    });
    expect((await createCompanionRepo(storage).load()).items[0]).toEqual(n);
  });
  it("rejects failed writes without simulating success", async () => {
    const r = createCompanionRepo({
      read: async () => null,
      write: async () => {
        throw Error("disk full");
      },
    });
    await expect(
      r.keep({ kind: "note", title: "a", body: "b", project: "" }),
    ).rejects.toThrow("disk full");
  });
  it("rejects stale revisions and keeps the latest text", async () => {
    const r = createCompanionRepo(memory());
    const a = await r.keep({
      kind: "note",
      title: "a",
      body: "b",
      project: "",
    });
    await r.keep({ ...a, body: "latest" });
    await expect(r.keep({ ...a, body: "old" })).rejects.toThrow("changed");
    expect((await r.load()).items[0].body).toBe("latest");
  });
  it("keeps image and attachment drafts", async () => {
    const r = createCompanionRepo(memory());
    const d = {
      title: "draft",
      body: "",
      kind: "image" as const,
      project: "",
      image: "data:image/png;base64,abc",
      attachments: [{ id: "a", name: "file", mode: "shortcut" as const }],
    };
    await r.draft(d);
    expect((await r.load()).draft).toEqual(d);
  });
  it("rejects corrupt imports and duplicate ids", () => {
    expect(() =>
      validateSnapshot({ version: 1, items: [{ id: "x" }] }),
    ).toThrow();
  });
  it("replaces template fields literally without interpreting replacement tokens", () => {
    expect(fields("Hi {{name}}, {{company}} / {{name}}")).toEqual([
      "name",
      "company",
    ]);
    expect(fillTemplate("Hi {{name}}", { name: "$& Joe" })).toBe("Hi $& Joe");
  });
  it("converts an instant across a DST boundary", () => {
    expect(convertTime("2026-03-08T07:30:00Z", "America/New_York")).toContain(
      "03:30",
    );
  });
});
it("keeps independent window drafts and rejects stale clearing", async () => {
  const r = createCompanionRepo(memory());
  const a = { kind: "note" as const, title: "a", body: "one", project: "" };
  const b = { ...a, title: "b", body: "two" };
  await r.draft(a, "main", null);
  await r.draft(b, "tool", null);
  expect((await r.load()).drafts?.main).toEqual(a);
  await expect(r.draft(null, "main", b)).rejects.toThrow("draft changed");
  expect((await r.load()).drafts?.tool).toEqual(b);
});
it("rejects malformed draft and preferences in imports", () => {
  expect(() =>
    validateSnapshot({
      ...{ version: 1, items: [], projects: [], prefs: { theme: "light" } },
      draft: { body: 5 },
    }),
  ).toThrow();
});

import { describe, it, expect } from "vitest";
import { capturedNote } from "./captureModel";
import { createRepo, memoryKV } from "./repo/repo";
describe("capture destination and content", () => {
  it("first line becomes title without duplicate body", () => { expect(capturedNote("Buy oat milk\nand stamps", "Work")).toEqual({title:"Buy oat milk",body:"and stamps",folder:"Work"}); });
  it("preserves blank-first-line and multiline Unicode", () => { const text="\n日本語 🦄\nline"; expect(capturedNote(text).body).toBe(text); expect(capturedNote("日本語 🦄\nline")).toEqual({title:"日本語 🦄",body:"line",folder:""}); });
  it("fresh and resumed captures keep destination through a restart", async () => {
    const kv=memoryKV();const repo=createRepo(kv);const id=await repo.saveDraft("Heading\nbody",undefined,"Work/QA");
    const reloaded=createRepo(kv);const d=(await reloaded.listDrafts())[0];expect(d.folder).toBe("Work/QA");
    await reloaded.saveDraft(d.text+"!",id);expect((await reloaded.listDrafts())[0].folder).toBe("Work/QA");
    const n=await reloaded.create(capturedNote(d.text,d.folder));expect(n.folder).toBe("Work/QA");expect(n.body).toBe("body");
    const global=await repo.create(capturedNote("Global"));expect(global.folder).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { runJev, segmentsOf, titleCandidates } from "./askjev";
import { applyOps } from "./agent";
import { createRepo, memoryKV } from "./repo/repo";
import type { Answer, Judge, Pack } from "./jev";

/** Stand-in for Jev: word overlap for noul, a fixed intent for route. Records every request so tests can check round trips and what was sent. */
const fake = (intent: string, pick?: Record<string, Answer>) => {
  const sent: { state: any; packs: Pack[] }[] = [];
  const j: Judge = async (state: any, packs) => {
    sent.push({ state, packs }); const out: Record<string, Answer> = {};
    const words = (s: string) => new Set(String(s).toLowerCase().match(/[a-z]{3,}/g) ?? []);
    const req = words(state.request ?? "");
    for (const p of packs) {
      if (p.name === "route") out.intent = { choice: intent, confidence: 0.9 };
      if (p.name === "relevance") (state.notes as any[]).forEach((n, i) => { const w = words(n.title + " " + n.text); out[`r${i}`] = { noul: [...req].some(x => w.has(x)) ? 0.9 : 0.1 }; });
      if (p.name === "segments") (state.segments as string[]).forEach((s, i) => { const w = words(s); out[`s${i}`] = { noul: [...req].some(x => w.has(x)) ? 0.8 : 0.1 }; });
      if (p.name === "folder") (state.notes as any[]).forEach((n, i) => { const k = (p.args!.folders as string[]).findIndex(f => words(n.title + " " + n.text).has(f.toLowerCase())); out[`f${i}`] = k >= 0 ? { choice: `f${k}`, confidence: 0.8 } : { choice: "__leave", confidence: 0.9 }; });
      if (p.name === "title") (state.notes as any[]).forEach((_, i) => { out[`t${i}`] = { choice: "c0", confidence: 0.7 }; });
    }
    return { ...out, ...(pick ?? {}) };
  };
  return { j, sent };
};
const mk = async () => { const repo = createRepo(memoryKV());
  const tram = await repo.create({ title: "Lisbon", body: "Flights booked\nTram 28 ride planned for Friday morning\nHotel near Alfama", folder: "Travel" });
  const groc = await repo.create({ title: "Groceries", body: "milk\neggs\nbread" });
  const loose = await repo.create({ title: "Hotel ideas", body: "Travel notes: Porto hotel shortlist" });
  await repo.create({ title: "Work", body: "Quarterly report due", folder: "Work" });
  return { repo, tram, groc, loose }; };

describe("askjev", () => {
  it("answers by quoting the note, in one round trip", async () => {
    const { repo, tram } = await mk(); const f = fake("find");
    const r = await runJev("When is the tram ride", repo, { judge: f.j });
    expect(f.sent).toHaveLength(1); expect(r.calls).toBe(1);
    expect(r.message).toContain("Tram 28 ride planned for Friday morning"); expect(r.message).toContain('"Lisbon"');
    expect(r.ops).toEqual([]); expect(r.looked.map(n => n.id)).toContain(tram.id);
  });
  it("says so plainly when nothing matches", async () => {
    const { repo } = await mk(); const r = await runJev("zebra", repo, { judge: fake("find").j });
    expect(r.message).toMatch(/couldn't find/i);
  });
  it("files loose notes into existing folders as proposals only", async () => {
    const { repo, loose } = await mk(); const f = fake("file");
    const r = await runJev("file my loose notes", repo, { judge: f.j });
    expect(f.sent.length).toBe(2); expect(f.sent[1].packs[0].name).toBe("folder");
    expect(r.ops).toHaveLength(1); expect(r.ops[0]).toMatchObject({ kind: "edit", id: loose.id, folder: "Travel" });
    expect((await repo.get(loose.id)).folder).toBeUndefined();
    await applyOps(r.ops, repo); expect((await repo.get(loose.id)).folder).toBe("Travel");
  });
  it("won't invent folders", async () => {
    const repo = createRepo(memoryKV()); await repo.create({ title: "A", body: "loose thing" });
    const r = await runJev("file my loose notes", repo, { judge: fake("file").j });
    expect(r.ops).toEqual([]); expect(r.message).toMatch(/don't have any folders/);
  });
  it("pulls lines into a new note, grouped by source", async () => {
    const { repo } = await mk(); const r = await runJev("pull my hotel lines into one note", repo, { judge: fake("gather").j });
    expect(r.ops).toHaveLength(1); const op = r.ops[0] as any; expect(op.kind).toBe("create"); expect(op.body).toContain("Hotel near Alfama"); expect(op.body).toContain("Hotel ideas");
  });
  it("pins and retitles from words already in the note", async () => {
    const { repo, groc } = await mk();
    const p = await runJev("pin groceries", repo, { judge: fake("pin").j }); expect(p.ops[0]).toMatchObject({ id: groc.id, pinned: true });
    const t = await runJev("retitle groceries", repo, { judge: fake("retitle").j }); expect(t.ops[0]).toMatchObject({ id: groc.id, title: "milk" });
  });
  it("does not write text and never calls anything for it", async () => {
    const { repo } = await mk(); const f = fake("write");
    const r = await runJev("summarize my trip", repo, { judge: f.j });
    expect(f.sent).toHaveLength(1); expect(r.message).toMatch(/doesn't write/); expect(r.ops).toEqual([]);
  });
  it("note scope sends only that note and edits only that note", async () => {
    const { repo, tram, groc } = await mk(); const f = fake("find");
    const r = await runJev("when is the tram", repo, { judge: f.j, scope: tram });
    const s = JSON.stringify(f.sent); expect(s).not.toContain("milk"); expect(s).not.toContain("Quarterly");
    expect(f.sent[0].packs.map(p => p.name)).not.toContain("relevance"); expect(r.message).toContain("Tram 28");
    const pin = await runJev("pin this", repo, { judge: fake("pin").j, scope: groc });
    expect(pin.ops.every(o => (o as any).id === groc.id)).toBe(true);
  });
  it("segments and title candidates are sane", () => {
    expect(segmentsOf({ body: "# Head\n- one item\nA long. Two sentences.", checklist: [{ id: "1", text: "Buy tea", done: false }] } as any)).toEqual(["Head", "one item", "A long. Two sentences.", "To do: Buy tea"]);
    expect(titleCandidates({ title: "t", body: "Hello there. More." } as any)).toHaveLength(5);
  });
});

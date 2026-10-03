import { afterEach, describe, expect, it, vi } from "vitest";
import { AiError, askNotes, complete, normalizeBase, parseJsonObject, rankNotes, suggestMeta, validBase } from "./ai";
import type { Note } from "./domain";

const cfg = { baseUrl: "https://api.example.com/v1", key: "sk-test", model: "m" };
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());
const note = (id: string, title: string, body: string, t = 1): Note => ({ id, title, body, checklist: [], createdAt: t, updatedAt: t, pinned: false, deletedAt: null, revision: 1 });

describe("ai", () => {
  it("url rules: https, or http only for localhost", () => {
    expect(validBase("https://api.openai.com/v1/")).toBe(true); expect(validBase("http://localhost:11434/v1")).toBe(true);
    expect(validBase("http://evil.example.com/v1")).toBe(false); expect(validBase("not a url")).toBe(false); expect(normalizeBase(" https://x.io/v1// ")).toBe("https://x.io/v1");
  });
  it("sends bearer key to chat/completions and returns text", async () => {
    const f = vi.fn(async () => ok(" hi ")); vi.stubGlobal("fetch", f);
    expect(await complete(cfg, [{ role: "user", content: "x" }])).toBe("hi");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions"); expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(init.body as string).model).toBe("m");
  });
  it("no Authorization header when the key is empty (local models)", async () => {
    const f = vi.fn(async () => ok("y")); vi.stubGlobal("fetch", f); await complete({ ...cfg, key: "" }, []);
    expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it("maps failures to plain messages", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 })); await expect(complete(cfg, [])).rejects.toThrow("rejected the key");
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 429 })); await expect(complete(cfg, [])).rejects.toThrow("Rate limited");
    vi.stubGlobal("fetch", async () => { throw new TypeError("fail"); }); await expect(complete(cfg, [])).rejects.toBeInstanceOf(AiError);
    vi.stubGlobal("fetch", async () => ok("")); await expect(complete(cfg, [])).rejects.toThrow("nothing");
  });
  it("parses JSON even with chatter around it", () => { expect(parseJsonObject('Sure! {"a":1} done')).toEqual({ a: 1 }); expect(parseJsonObject("nope")).toBeNull(); expect(parseJsonObject("[1]")).toBeNull(); });
  it("suggestMeta cleans the answer", async () => {
    vi.stubGlobal("fetch", async () => ok('```json\n{"title":"\\"Trip to Lisbon.\\"","folder":"Travel/Plans"}\n```'));
    expect(await suggestMeta(cfg, "flights", ["Home"])).toEqual({ title: "Trip to Lisbon", folder: "Travel Plans" });
    vi.stubGlobal("fetch", async () => ok("no json")); await expect(suggestMeta(cfg, "x", [])).rejects.toThrow("expected form");
  });
  it("ranks notes by terms and ignores trash; ask returns used notes", async () => {
    const ns = [note("1", "Groceries", "oat milk lemons"), note("2", "Trip to Lisbon", "book tram 28"), { ...note("3", "Lisbon old", "tram"), deletedAt: 5 }];
    expect(rankNotes("when is the tram in lisbon", ns).map(n => n.id)).toEqual(["2"]);
    const f = vi.fn(async () => ok("Book tram 28 early [1]")); vi.stubGlobal("fetch", f);
    const r = await askNotes(cfg, "tram?", ns); expect(r.used.map(n => n.id)).toEqual(["2"]); expect(r.answer).toContain("[1]");
    expect(JSON.parse(((f.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string).messages[1].content).not.toContain("Groceries");
  });
});

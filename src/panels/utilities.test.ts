import { describe, expect, it } from "vitest";
import { counts, UTILS } from "./utilities";
const run = (id: string, s: string) => UTILS.find(u => u.id === id)!.run(s);
describe("utilities", () => {
  it("case", () => { expect(run("upper", "a b")).toBe("A B"); expect(run("title", "the QUICK brown-fox")).toBe("The Quick Brown-Fox"); });
  it("trim collapses runs of spaces per line", () => { expect(run("trim", "  a   b  \n  c ")).toBe("a b\nc"); });
  it("lines", () => { expect(run("lines", "a\n\n  \nb")).toBe("a\nb"); expect(run("dedupe", "a\nb\na")).toBe("a\nb"); expect(run("sort", "b\na\nC")).toBe("a\nb\nC"); });
  it("slug strips accents and punctuation", () => { expect(run("slug", " Crème Brûlée, 2 for 1! ")).toBe("creme-brulee-2-for-1"); });
  it("counts", () => { expect(counts("")).toEqual({ words: 0, chars: 0, lines: 0 }); expect(counts("a b\nc")).toEqual({ words: 3, chars: 5, lines: 2 }); });
});

import { describe, expect, it } from "vitest";
import { answer, evaluate } from "./calc";
describe("calc", () => {
  it("precedence and parens", () => { expect(evaluate("2 + 3 * 4")).toBe(14); expect(evaluate("(2 + 3) * 4")).toBe(20); expect(evaluate("2 ^ 3 ^ 2")).toBe(512); expect(evaluate("-3 + 5")).toBe(2); });
  it("percent and of", () => { expect(evaluate("20% of 50")).toBe(10); expect(evaluate("200 * 15%")).toBe(30); });
  it("rejects junk, division by zero and unknown names", () => { expect(evaluate("1 / 0")).toBeNull(); expect(evaluate("foo + 1")).toBeNull(); expect(evaluate("1 +")).toBeNull(); expect(evaluate("alert(1)")).toBeNull(); expect(evaluate("2 $ 3")).toBeNull(); });
  it("thousands commas", () => { expect(evaluate("1,200 + 300")).toBe(1500); });
  it("answers a line ending in =", () => { expect(answer(["12 * 3 ="])).toBe("36"); expect(answer(["0.1 + 0.2 ="])).toBe("0.3"); expect(answer(["1000 * 1.5 ="])).toBe("1,500"); });
  it("named values from earlier lines", () => {
    expect(answer(["fuel: 180", "hotel: 420 * 2", "fuel + hotel ="])).toBe("1,020");
    expect(answer(["a: 2", "b: a * 5", "b + 1 ="])).toBe("11");
  });
  it("ignores lone numbers and lines without =", () => { expect(answer(["5 ="])).toBeNull(); expect(answer(["1 + 1"])).toBeNull(); expect(answer(["hello ="])).toBeNull(); });
  it("multiplication sign x between numbers", () => { expect(evaluate("3 x 4")).toBe(12); });
});

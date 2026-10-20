import { describe, expect, it } from "vitest";
import { createShakeDetector, shakeOpts } from "./gesture";

const run = (path: [number, number][], stepMs: number, buttons = 0) => {
  let fired = 0; const d = createShakeDetector(() => fired++, undefined, 1200);
  path.forEach(([x, y], i) => d.move(x, y, i * stepMs, buttons)); return fired;
};
const shake = (swings: number, amp: number, steps = 5): [number, number][] => {
  const p: [number, number][] = [[300, 300]];
  for (let s = 0; s < swings; s++) for (let i = 1; i <= steps; i++) p.push([300 + (s % 2 === 0 ? 1 : -1) * amp * (i / steps) + (s % 2 === 0 ? 0 : amp), 300]);
  return p;
};

describe("shake detector", () => {
  it("fires on a quick back-and-forth", () => { expect(run(shake(6, 80), 14)).toBe(1); });
  it("fires on a vertical shake too", () => { expect(run(shake(6, 80).map(([x, y]) => [y, x] as [number, number]), 14)).toBe(1); });
  it("ignores a single sweep", () => { expect(run(shake(1, 400, 30), 10)).toBe(0); });
  it("ignores slow wandering", () => { expect(run(shake(6, 80), 90)).toBe(0); });
  it("ignores tiny jitter", () => { expect(run(shake(10, 6, 3), 10)).toBe(0); });
  it("ignores movement while a button is held (dragging, selecting)", () => { expect(run(shake(6, 80), 14, 1)).toBe(0); });
  it("does not re-fire during the cooldown", () => { expect(run([...shake(6, 80), ...shake(6, 80)], 14)).toBe(1); });
});

describe("shake sensitivity", () => {
  const at = (v: number, path: [number, number][]) => { let n = 0; const d = createShakeDetector(() => n++, shakeOpts(v), 1200); path.forEach(([x, y], i) => d.move(x, y, i * 14, 0)); return n; };
  it("50 equals the old default", () => { expect(shakeOpts(50)).toEqual({ windowMs: 700, minSwing: 40, reversals: 4, minSpeed: 0.6 }); });
  it("hair-trigger end fires on a small wiggle that the middle ignores", () => { const p = shake(4, 30, 4); expect(at(50, p)).toBe(0); expect(at(100, p)).toBe(1); });
  it("firm end ignores a normal shake but fires on a big one", () => { expect(at(50, shake(6, 65))).toBe(1); expect(at(0, shake(6, 65))).toBe(0); expect(at(0, shake(10, 90))).toBe(1); });
  it("is monotonic and clamps", () => { expect(shakeOpts(-20)).toEqual(shakeOpts(0)); expect(shakeOpts(500)).toEqual(shakeOpts(100)); expect(shakeOpts(75).minSwing).toBeLessThan(shakeOpts(25).minSwing); });
});

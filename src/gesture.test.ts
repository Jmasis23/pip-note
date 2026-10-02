import { describe, expect, it } from "vitest";
import { createShakeDetector, SHAKE_LEVELS } from "./gesture";
import type { ShakeLevel } from "./gesture";

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
  const at = (l: ShakeLevel, path: [number, number][]) => { let n = 0; const d = createShakeDetector(() => n++, SHAKE_LEVELS[l], 1200); path.forEach(([x, y], i) => d.move(x, y, i * 14, 0)); return n; };
  it("hair-trigger fires on a small wiggle that normal ignores", () => { const p = shake(4, 30, 4); expect(at("normal", p)).toBe(0); expect(at("eager", p)).toBe(1); });
  it("gentle ignores a normal shake but fires on a big one", () => { expect(at("normal", shake(6, 65))).toBe(1); expect(at("gentle", shake(6, 65))).toBe(0); expect(at("gentle", shake(10, 90))).toBe(1); });
});

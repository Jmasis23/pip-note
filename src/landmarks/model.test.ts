import { describe, expect, it } from "vitest";
import {
  createWiggleTest,
  defaultPresets,
  DEFAULT_OPTS,
  optsFromSensitivity,
  reconcile,
  validate,
  type Layout,
} from "./model";
const mon = { id: "M1", x: 0, y: 0, w: 1920, h: 1080, scale: 1 };
function wiggle(
  cx: number,
  cy: number,
  amp: number,
  strokes: number,
  per: number,
) {
  const p: [number, number][] = [[cx - amp / 2, cy]];
  for (let s = 0; s < strokes; s++)
    for (let i = 1; i <= per; i++) {
      const k = i / per;
      p.push([cx - amp / 2 + (s % 2 === 0 ? amp * k : amp - amp * k), cy]);
    }
  return p;
}
const TR: [number, number, number, number] = [1689.6, 0, 230.4, 172.8];
const mk = (o = () => DEFAULT_OPTS) =>
  createWiggleTest(
    () => [{ id: "tr", r: TR }],
    o,
    () => {},
  );
function run(
  path: [number, number][],
  step = 8,
  down = false,
  t0 = 0,
  det = mk(),
) {
  return path
    .map(([x, y], i) => det.move(x, y, t0 + i * step, down))
    .filter(Boolean).length;
}
describe("landmark validation", () => {
  it("presets are valid", () =>
    expect(validate(defaultPresets("M1"))).toBeNull());
  it("explains overlaps", () => {
    const l = defaultPresets("M1");
    l[1].rect = { x: 0.05, y: 0.05, w: 0.2, h: 0.3 };
    expect(validate(l)).toMatch(/Top left.*overlaps.*Left edge.*can't overlap/);
  });
  it("allows the same rect on different monitors", () =>
    expect(
      validate([...defaultPresets("M1"), ...defaultPresets("M2")]),
    ).toBeNull());
  it("rejects out of bounds and tiny regions", () => {
    const a = defaultPresets("M1");
    a[0].rect.w = 0.5;
    expect(validate(a)).toMatch(/outside/);
    const b = defaultPresets("M1");
    b[0].rect.h = 0.01;
    expect(validate(b)).toMatch(/too small/);
  });
});
describe("display changes", () => {
  it("keeps same-shape changes and flags removed or reshaped monitors", () => {
    const layout: Layout = { monitors: [mon], landmarks: defaultPresets("M1") };
    expect(
      reconcile(layout, [{ ...mon, w: 2560, h: 1440 }]).flagged,
    ).toHaveLength(0);
    expect(reconcile(layout, []).flagged).toHaveLength(4);
    expect(
      reconcile(layout, [{ ...mon, w: 3440, h: 1440 }]).flagged,
    ).toHaveLength(4);
  });
});
describe("wiggle progress", () => {
  it("rises with reversals, reads 0 for hover and single sweeps, clears on fire", () => {
    const det = mk();
    const seen = wiggle(1805, 86, 80, 6, 8).map(([x, y], i) => {
      det.move(x, y, i * 8);
      return det.progress();
    });
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(0.5);
    expect(det.progress()).toBe(0);
    const d2 = mk();
    for (let i = 0; i < 60; i++) {
      d2.move(1700 + i * 3, 86, i * 8);
      expect(d2.progress()).toBe(0);
    }
  });
});
describe("wiggle test recognizer", () => {
  it("fires on a deliberate wiggle in the region", () =>
    expect(run(wiggle(1805, 86, 80, 6, 8))).toBe(1));
  it("ignores wiggles outside, single sweeps, drags, slow motion", () => {
    expect(run(wiggle(960, 540, 80, 8, 8))).toBe(0);
    expect(
      run(
        Array.from(
          { length: 80 },
          (_, i) => [1500 + i * 5, 86] as [number, number],
        ),
      ),
    ).toBe(0);
    expect(run(wiggle(1805, 86, 80, 8, 8), 8, true)).toBe(0);
    expect(run(wiggle(1805, 86, 80, 6, 8), 90)).toBe(0);
  });
  it("fires once during nonstop wiggling", () =>
    expect(run(wiggle(1805, 86, 80, 40, 8))).toBe(1));
  it("sensitivity 50 is the default; firm ignores small wiggles", () => {
    expect(optsFromSensitivity(50)).toEqual(DEFAULT_OPTS);
    expect(
      run(
        wiggle(1805, 86, 28, 6, 6),
        8,
        false,
        0,
        mk(() => optsFromSensitivity(0)),
      ),
    ).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { createSpin, dragBy, release, restAngle, stepSpin } from "../src/landing/ticket3d/dragSpin";

const run = (s: ReturnType<typeof createSpin>, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepSpin(s, 1 / 60);
};

describe("drag to spin the ticket", () => {
  it("turns with the pointer while held: sideways on Y, up and down on X", () => {
    const s = createSpin();
    dragBy(s, 100, 0);
    expect(s.y).toBeCloseTo(1, 5);
    dragBy(s, 0, -50);
    expect(s.x).toBeCloseTo(-0.5, 5);
    run(s, 1);
    expect(s.y).toBeCloseTo(1, 5);
  });

  it("keeps spinning a little after release, then settles facing front on the nearest full turn", () => {
    const s = createSpin();
    for (let i = 0; i < 10; i++) dragBy(s, 70, 0);
    release(s);
    stepSpin(s, 1 / 60);
    expect(s.y).toBeGreaterThan(7);
    run(s, 6);
    expect(s.y).toBeCloseTo(restAngle(s.y), 2);
    expect(Math.abs(s.y - 2 * Math.PI)).toBeLessThan(0.02);
    expect(s.x).toBeCloseTo(0, 2);
  });

  it("rests on the nearest whole turn", () => {
    expect(restAngle(0.4)).toBe(0);
    expect(restAngle(3.5)).toBeCloseTo(2 * Math.PI);
    expect(restAngle(-3.5)).toBeCloseTo(-2 * Math.PI);
  });
});

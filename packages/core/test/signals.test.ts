import { describe, expect, it } from "vitest";
import {
  boxUnder,
  nearestLinks,
  scrollDepthOf,
  scrollVelocityOf,
  velocityOf,
  type Box,
} from "../src/signals";

const box = (id: string, x: number, y: number): Box => ({ id, x, y, width: 100, height: 20 });

describe("velocityOf", () => {
  it("measures pixels per second across the window", () => {
    expect(
      velocityOf([
        { x: 0, y: 0, t: 0 },
        { x: 100, y: 50, t: 500 },
      ]),
    ).toEqual({
      vx: 200,
      vy: 100,
    });
  });

  it("is zero without two distinct samples", () => {
    expect(velocityOf([])).toEqual({ vx: 0, vy: 0 });
    expect(velocityOf([{ x: 1, y: 1, t: 1 }])).toEqual({ vx: 0, vy: 0 });
    expect(
      velocityOf([
        { x: 0, y: 0, t: 5 },
        { x: 9, y: 9, t: 5 },
      ]),
    ).toEqual({ vx: 0, vy: 0 });
  });
});

describe("nearestLinks", () => {
  const boxes = [box("near", 0, 0), box("ahead", 0, 400), box("far", 0, 2000)];

  it("picks the closest links when the pointer stands still", () => {
    expect(nearestLinks({ x: 50, y: 10 }, { vx: 0, vy: 0 }, boxes, 2)).toEqual(["near", "ahead"]);
  });

  it("prefers the link the pointer is heading for", () => {
    const heading = nearestLinks({ x: 50, y: 300 }, { vx: 0, vy: 900 }, boxes, 1);
    expect(heading).toEqual(["ahead"]);
    const away = nearestLinks({ x: 50, y: 300 }, { vx: 0, vy: -900 }, boxes, 1);
    expect(away).toEqual(["near"]);
  });

  it("returns at most the requested count", () => {
    expect(nearestLinks({ x: 0, y: 0 }, { vx: 0, vy: 0 }, boxes)).toHaveLength(3);
    expect(nearestLinks({ x: 0, y: 0 }, { vx: 0, vy: 0 }, [])).toEqual([]);
  });
});

describe("boxUnder", () => {
  it("finds the box the pointer is inside", () => {
    expect(boxUnder({ x: 50, y: 10 }, [box("a", 0, 0)])).toBe("a");
    expect(boxUnder({ x: 500, y: 10 }, [box("a", 0, 0)])).toBe(null);
  });
});

describe("scrollDepthOf", () => {
  it("runs from 0 at the top to 1 at the bottom", () => {
    expect(scrollDepthOf(0, 800, 2400)).toBe(0);
    expect(scrollDepthOf(800, 800, 2400)).toBe(0.5);
    expect(scrollDepthOf(1600, 800, 2400)).toBe(1);
  });

  it("is 1 for a page that does not scroll, and clamped otherwise", () => {
    expect(scrollDepthOf(0, 800, 800)).toBe(1);
    expect(scrollDepthOf(-50, 800, 2400)).toBe(0);
    expect(scrollDepthOf(9999, 800, 2400)).toBe(1);
  });
});

describe("scrollVelocityOf", () => {
  it("measures viewport heights per second, signed", () => {
    expect(scrollVelocityOf({ y: 0, t: 0 }, { y: 800, t: 1000 }, 800)).toBe(1);
    expect(scrollVelocityOf({ y: 800, t: 0 }, { y: 0, t: 1000 }, 800)).toBe(-1);
  });

  it("is zero without elapsed time or viewport height", () => {
    expect(scrollVelocityOf({ y: 0, t: 5 }, { y: 800, t: 5 }, 800)).toBe(0);
    expect(scrollVelocityOf({ y: 0, t: 0 }, { y: 800, t: 1000 }, 0)).toBe(0);
  });
});

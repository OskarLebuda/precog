import { describe, expect, it } from "vitest";
import { cacheKey, hash } from "../src/server/cache";
import type { PrecogState } from "../src/types";

const state = (over: Partial<PrecogState> = {}): PrecogState => ({
  page: { path: "/blog", title: "Blog", h1: "Blog", description: "" },
  session: { previousPaths: ["/"], timeOnPageMs: 1000, scrollDepth: 0.5, scrollVelocity: 0 },
  pointer: { hasHover: true, x: 5, y: 5, vx: 0, vy: 0, nearestIds: ["l0"], hoveredId: null },
  device: { saveData: false, effectiveType: "4g" },
  candidates: [
    { id: "l0", path: "/a", text: "A", inViewport: true, position: { x: 1, y: 2 } },
    { id: "l1", path: "/b", text: "B", inViewport: false, position: { x: 1, y: 9 } },
  ],
  ...over,
});

describe("hash", () => {
  it("is stable and differs for different input", () => {
    expect(hash("abc")).toBe(hash("abc"));
    expect(hash("abc")).not.toBe(hash("abd"));
    expect(hash("")).toHaveLength(12);
  });
});

describe("cacheKey", () => {
  it("is stable for the same page and candidates", () => {
    expect(cacheKey(state(), "jev-latest")).toBe(cacheKey(state(), "jev-latest"));
  });

  it("ignores the order the candidates arrive in", () => {
    const reversed = state({ candidates: [...state().candidates].reverse() });
    expect(cacheKey(reversed, "jev-latest")).toBe(cacheKey(state(), "jev-latest"));
  });

  it("ignores small pointer movement", () => {
    const moved = state({
      pointer: { ...state().pointer, x: 9, y: 1, vx: 40, vy: -40 },
    });
    expect(cacheKey(moved, "jev-latest")).toBe(cacheKey(state(), "jev-latest"));
  });

  it("ignores a small scroll but not a large one", () => {
    const nudged = state({ session: { ...state().session, scrollDepth: 0.55 } });
    const scrolled = state({ session: { ...state().session, scrollDepth: 0.9 } });
    expect(cacheKey(nudged, "jev-latest")).toBe(cacheKey(state(), "jev-latest"));
    expect(cacheKey(scrolled, "jev-latest")).not.toBe(cacheKey(state(), "jev-latest"));
  });

  it("changes when the hovered link changes", () => {
    const hovered = state({ pointer: { ...state().pointer, hoveredId: "l1" } });
    expect(cacheKey(hovered, "jev-latest")).not.toBe(cacheKey(state(), "jev-latest"));
  });

  it("changes when the page, the candidates, their visibility or the model change", () => {
    const base = cacheKey(state(), "jev-latest");
    expect(cacheKey(state({ page: { ...state().page, path: "/other" } }), "jev-latest")).not.toBe(
      base,
    );
    expect(cacheKey(state(), "jev-2")).not.toBe(base);
    const changed = state({
      candidates: [{ id: "l0", path: "/z", text: "", inViewport: true, position: { x: 0, y: 0 } }],
    });
    expect(cacheKey(changed, "jev-latest")).not.toBe(base);
    const hidden = state({
      candidates: state().candidates.map((c) => ({ ...c, inViewport: false })),
    });
    expect(cacheKey(hidden, "jev-latest")).not.toBe(base);
  });

  it("changes when the visitor has been reading much longer", () => {
    const base = cacheKey(state(), "jev-latest");
    const later = state({ session: { ...state().session, timeOnPageMs: 45_000 } });
    expect(cacheKey(later, "jev-latest")).not.toBe(base);
  });
});

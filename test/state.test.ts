import { describe, expect, it } from "vitest";
import { buildState, type StateInput } from "../src/runtime/core/state.ts";
import type { PrecogLink } from "../src/runtime/types.ts";

const candidate = (over: Partial<PrecogLink> = {}): PrecogLink => ({
  id: "l0",
  path: "/a",
  text: "A",
  inViewport: true,
  position: { x: 5, y: 5 },
  href: "https://example.com/a",
  blank: false,
  ...over,
});

const input = (over: Partial<StateInput> = {}): StateInput => ({
  page: { path: "/blog", title: "Blog", h1: "Blog", description: "Posts" },
  session: {
    previousPaths: ["/", "/about"],
    timeOnPageMs: 1234.7,
    scrollDepth: 0.4567,
    scrollVelocity: 1.234,
  },
  pointer: {
    hasHover: true,
    x: 4.4,
    y: 6.6,
    vx: 1.234,
    vy: -2.345,
    nearestIds: ["l0", "l1", "l2", "l3"],
    hoveredId: null,
  },
  device: { saveData: false, effectiveType: "4g" },
  candidates: [candidate()],
  privacy: { sendQuery: false, sendAnchorText: true, sendHistory: true, requireConsent: false },
  ...over,
});

describe("buildState", () => {
  it("rounds and clamps the signals", () => {
    const state = buildState(input());
    expect(state.session).toEqual({
      previousPaths: ["/", "/about"],
      timeOnPageMs: 1235,
      scrollDepth: 0.46,
      scrollVelocity: 1.2,
    });
    expect(state.pointer).toMatchObject({ x: 4, y: 7, vx: 1.2, vy: -2.3 });
  });

  it("keeps at most three nearest ids and five earlier paths", () => {
    const state = buildState(
      input({
        session: {
          previousPaths: ["/1", "/2", "/3", "/4", "/5", "/6", "/7"],
          timeOnPageMs: 0,
          scrollDepth: 0,
          scrollVelocity: 0,
        },
      }),
    );
    expect(state.pointer.nearestIds).toEqual(["l0", "l1", "l2"]);
    expect(state.session.previousPaths).toEqual(["/3", "/4", "/5", "/6", "/7"]);
  });

  it("drops the history when it is switched off", () => {
    const state = buildState(
      input({
        privacy: {
          sendQuery: false,
          sendAnchorText: true,
          sendHistory: false,
          requireConsent: false,
        },
      }),
    );
    expect(state.session.previousPaths).toEqual([]);
  });

  it("strips queries from the page path and the history", () => {
    const state = buildState(
      input({
        page: { path: "/blog?token=secret", title: "", h1: "", description: "" },
        session: {
          previousPaths: ["/a?token=secret"],
          timeOnPageMs: 0,
          scrollDepth: 0,
          scrollVelocity: 0,
        },
      }),
    );
    expect(state.page.path).toBe("/blog");
    expect(state.session.previousPaths).toEqual(["/a"]);
  });

  it("keeps queries when they are allowed", () => {
    const state = buildState(
      input({
        page: { path: "/blog?p=2", title: "", h1: "", description: "" },
        privacy: {
          sendQuery: true,
          sendAnchorText: true,
          sendHistory: true,
          requireConsent: false,
        },
      }),
    );
    expect(state.page.path).toBe("/blog?p=2");
  });

  it("truncates the page text", () => {
    const state = buildState(
      input({
        page: {
          path: "/",
          title: "t".repeat(500),
          h1: "h".repeat(500),
          description: "d".repeat(500),
        },
      }),
    );
    expect(state.page.title).toHaveLength(120);
    expect(state.page.h1).toHaveLength(120);
    expect(state.page.description).toHaveLength(200);
  });

  it("clamps out-of-range and non-finite signals", () => {
    const state = buildState(
      input({
        session: {
          previousPaths: [],
          timeOnPageMs: Number.POSITIVE_INFINITY,
          scrollDepth: 5,
          scrollVelocity: -999,
        },
        pointer: {
          hasHover: false,
          x: Number.NaN,
          y: 1000,
          vx: 9999,
          vy: -9999,
          nearestIds: [],
          hoveredId: "l0",
        },
      }),
    );
    expect(state.session.timeOnPageMs).toBe(0);
    expect(state.session.scrollDepth).toBe(1);
    expect(state.session.scrollVelocity).toBe(-20);
    expect(state.pointer).toMatchObject({ x: 0, y: 20, vx: 100, vy: -100 });
  });

  it("sends candidates without their client-only fields", () => {
    const state = buildState(input());
    expect(state.candidates).toEqual([
      { id: "l0", path: "/a", text: "A", inViewport: true, position: { x: 5, y: 5 } },
    ]);
  });

  it("stays small enough for one Jev request", () => {
    const candidates = Array.from({ length: 30 }, (_, i) =>
      candidate({ id: `l${i}`, path: `/post/${i}`, text: `Post number ${i}` }),
    );
    const size = JSON.stringify(buildState(input({ candidates }))).length;
    expect(size).toBeLessThan(6000);
  });
});

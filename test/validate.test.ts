import { describe, expect, it } from "vitest";
import {
  isSameSite,
  normalizePath,
  validateState,
  type ValidateOptions,
} from "../src/runtime/server/utils/validate.ts";

const options = (over: Partial<ValidateOptions> = {}): ValidateOptions => ({
  maxCandidates: 30,
  sendQuery: false,
  sendAnchorText: true,
  sendHistory: true,
  exclude: ["/logout", "/api/**"],
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  page: { path: "/blog", title: "Blog", h1: "Blog", description: "Posts" },
  session: { previousPaths: ["/"], timeOnPageMs: 1000, scrollDepth: 0.5, scrollVelocity: 0 },
  pointer: { hasHover: true, x: 5, y: 5, vx: 0, vy: 0, nearestIds: ["l0"], hoveredId: "l0" },
  device: { saveData: false, effectiveType: "4g" },
  candidates: [
    { id: "l0", path: "/a", text: "A", inViewport: true, position: { x: 1, y: 2 } },
    { id: "l1", path: "/b", text: "B", inViewport: false, position: { x: 1, y: 9 } },
  ],
  ...over,
});

describe("normalizePath", () => {
  it("accepts a plain path", () => {
    expect(normalizePath("/blog/hello", false)).toBe("/blog/hello");
  });

  it("rejects anything that is not a rooted path", () => {
    expect(normalizePath("blog", false)).toBe(null);
    expect(normalizePath("https://evil.com/x", false)).toBe(null);
    expect(normalizePath("//evil.com/x", false)).toBe(null);
    expect(normalizePath("", false)).toBe(null);
    expect(normalizePath(42, false)).toBe(null);
    expect(normalizePath("/a".repeat(400), false)).toBe(null);
  });

  it("rejects backslashes, whitespace and control characters", () => {
    expect(normalizePath("/a\\b", false)).toBe(null);
    expect(normalizePath("/a b", false)).toBe(null);
    expect(normalizePath("/a\nb", false)).toBe(null);
    expect(normalizePath("/a\u0000b", false)).toBe(null);
  });

  it("drops the hash, and the query unless it is allowed", () => {
    expect(normalizePath("/a?x=1#top", false)).toBe("/a");
    expect(normalizePath("/a?x=1#top", true)).toBe("/a?x=1");
  });
});

describe("validateState", () => {
  it("accepts a well-formed body", () => {
    const result = validateState(body(), options());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.candidates.map((c) => c.id)).toEqual(["l0", "l1"]);
    expect(result.state.page.path).toBe("/blog");
  });

  it("rejects a body that is not an object", () => {
    expect(validateState("nope", options())).toMatchObject({ ok: false });
    expect(validateState(null, options())).toMatchObject({ ok: false });
    expect(validateState([1], options())).toMatchObject({ ok: false });
  });

  it("rejects a bad page path", () => {
    expect(validateState(body({ page: { path: "https://evil.com" } }), options())).toMatchObject({
      ok: false,
      reason: "bad page path",
    });
  });

  it("rejects a forged candidate id", () => {
    const result = validateState(
      body({
        candidates: [{ id: "admin", path: "/a", text: "", inViewport: true, position: {} }],
      }),
      options(),
    );
    expect(result).toMatchObject({ ok: false, reason: "candidate 0 has a forged id" });
  });

  it("rejects candidates that are not objects, missing, or too many", () => {
    expect(validateState(body({ candidates: "no" }), options())).toMatchObject({ ok: false });
    expect(validateState(body({ candidates: [] }), options())).toMatchObject({ ok: false });
    expect(validateState(body({ candidates: ["x"] }), options())).toMatchObject({ ok: false });
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i}`,
      path: `/p${i}`,
      text: "",
      inViewport: true,
      position: {},
    }));
    expect(validateState(body({ candidates: many }), options({ maxCandidates: 3 }))).toMatchObject({
      ok: false,
      reason: "too many candidates",
    });
  });

  it("rejects a candidate with an off-site path", () => {
    expect(
      validateState(
        body({
          candidates: [
            { id: "l0", path: "https://evil.com/x", text: "", inViewport: true, position: {} },
          ],
        }),
        options(),
      ),
    ).toMatchObject({ ok: false, reason: "candidate 0 has a bad path" });
  });

  it("drops excluded and duplicated candidates", () => {
    const result = validateState(
      body({
        candidates: [
          { id: "l0", path: "/logout", text: "", inViewport: true, position: {} },
          { id: "l1", path: "/a", text: "", inViewport: true, position: {} },
          { id: "l2", path: "/a", text: "", inViewport: true, position: {} },
        ],
      }),
      options(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.candidates.map((c) => c.path)).toEqual(["/a"]);
  });

  it("fails when nothing is left after filtering", () => {
    expect(
      validateState(
        body({ candidates: [{ id: "l0", path: "/logout", text: "", inViewport: true }] }),
        options(),
      ),
    ).toMatchObject({ ok: false, reason: "no allowed candidates" });
  });

  it("drops pointer ids that were not sent as candidates", () => {
    const result = validateState(
      body({
        pointer: { hasHover: true, nearestIds: ["l0", "admin"], hoveredId: "admin" },
      }),
      options(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pointer.nearestIds).toEqual(["l0"]);
    expect(result.state.pointer.hoveredId).toBe(null);
  });

  it("clamps out-of-range numbers and coerces missing sections", () => {
    const result = validateState(
      {
        page: { path: "/" },
        candidates: [{ id: "l0", path: "/a" }],
        session: { scrollDepth: 99, timeOnPageMs: "no", scrollVelocity: -500 },
      },
      options(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.session).toMatchObject({
      scrollDepth: 1,
      timeOnPageMs: 0,
      scrollVelocity: -20,
    });
    expect(result.state.pointer.hasHover).toBe(false);
    expect(result.state.candidates[0]!.position).toEqual({ x: 0, y: 0 });
  });

  it("honours the privacy switches", () => {
    const result = validateState(
      body({ candidates: [{ id: "l0", path: "/a?p=1", text: "secret", inViewport: true }] }),
      options({ sendAnchorText: false, sendHistory: false }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.candidates[0]).toMatchObject({ text: "", path: "/a" });
    expect(result.state.session.previousPaths).toEqual([]);
  });

  it("keeps queries when they are allowed", () => {
    const result = validateState(
      body({
        page: { path: "/blog?p=2" },
        candidates: [{ id: "l0", path: "/a?p=1", text: "", inViewport: true }],
      }),
      options({ sendQuery: true }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.page.path).toBe("/blog?p=2");
    expect(result.state.candidates[0]!.path).toBe("/a?p=1");
  });

  it("keeps at most five earlier paths and drops bad ones", () => {
    const result = validateState(
      body({
        session: { previousPaths: ["/1", "/2", "/3", "/4", "/5", "/6", "https://evil.com"] },
      }),
      options(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.session.previousPaths).toEqual(["/3", "/4", "/5", "/6"]);
  });

  it("keeps the hint flag", () => {
    const result = validateState(
      body({ candidates: [{ id: "l0", path: "/a", hint: true, inViewport: true }] }),
      options(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.candidates[0]!.hint).toBe(true);
  });
});

describe("isSameSite", () => {
  it("trusts the fetch metadata header when it is there", () => {
    expect(isSameSite({ secFetchSite: "same-origin" })).toBe(true);
    expect(isSameSite({ secFetchSite: "same-site" })).toBe(true);
    expect(isSameSite({ secFetchSite: "cross-site" })).toBe(false);
    expect(isSameSite({ secFetchSite: "none" })).toBe(false);
  });

  it("falls back to comparing origin and host", () => {
    expect(isSameSite({ origin: "https://a.com", host: "a.com" })).toBe(true);
    expect(isSameSite({ origin: "https://evil.com", host: "a.com" })).toBe(false);
    expect(isSameSite({ origin: "not a url", host: "a.com" })).toBe(false);
  });

  it("allows a request with neither header", () => {
    expect(isSameSite({})).toBe(true);
  });
});

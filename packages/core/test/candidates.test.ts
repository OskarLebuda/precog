import { describe, expect, it } from "vitest";
import {
  buildCandidates,
  fingerprint,
  toPath,
  toWire,
  type CandidateContext,
  type RawLink,
} from "../src/candidates";

const origin = "https://example.com";

const ctx = (over: Partial<CandidateContext> = {}): CandidateContext => ({
  origin,
  currentPath: "/",
  viewport: { width: 1000, height: 800 },
  maxCandidates: 30,
  exclude: ["/logout", "/api/**"],
  sendQuery: false,
  sendAnchorText: true,
  ...over,
});

const link = (over: Partial<RawLink> = {}): RawLink => ({
  href: `${origin}/a`,
  text: "A",
  rect: { x: 10, y: 10, width: 100, height: 20 },
  download: false,
  target: "",
  precog: null,
  ...over,
});

describe("toPath", () => {
  it("keeps a same-origin path", () => {
    expect(toPath(`${origin}/blog`, origin, "/", false)).toBe("/blog");
  });

  it("drops another origin", () => {
    expect(toPath("https://other.com/blog", origin, "/", false)).toBe(null);
  });

  it("drops another protocol", () => {
    expect(toPath("mailto:a@b.c", origin, "/", false)).toBe(null);
    expect(toPath("javascript:void(0)", origin, "/", false)).toBe(null);
  });

  it("drops the current page and its hashes", () => {
    expect(toPath(`${origin}/blog`, origin, "/blog", false)).toBe(null);
    expect(toPath(`${origin}/blog#top`, origin, "/blog", false)).toBe(null);
  });

  it("strips the query unless asked to keep it", () => {
    expect(toPath(`${origin}/blog?p=2`, origin, "/", false)).toBe("/blog");
    expect(toPath(`${origin}/blog?p=2`, origin, "/", true)).toBe("/blog?p=2");
  });

  it("compares against the current query only when queries are kept", () => {
    expect(toPath(`${origin}/blog?p=2`, origin, "/blog?p=1", true)).toBe("/blog?p=2");
    expect(toPath(`${origin}/blog?p=2`, origin, "/blog?p=1", false)).toBe(null);
  });

  it("returns null for an unparseable href", () => {
    expect(toPath("http://[", origin, "/", false)).toBe(null);
  });
});

describe("buildCandidates", () => {
  it("assigns gapless ids and absolute hrefs", () => {
    const out = buildCandidates([link({ href: "/a" }), link({ href: "/b" })], ctx());
    expect(out.map((c) => c.id)).toEqual(["l0", "l1"]);
    expect(out[0]!.href).toBe(`${origin}/a`);
  });

  it("skips opted-out, downloadable and excluded links", () => {
    const out = buildCandidates(
      [
        link({ href: "/a", precog: "off" }),
        link({ href: "/b", download: true }),
        link({ href: "/logout" }),
        link({ href: "/api/v1/x" }),
        link({ href: "/keep" }),
      ],
      ctx(),
    );
    expect(out.map((c) => c.path)).toEqual(["/keep"]);
  });

  it("dedupes by path", () => {
    const out = buildCandidates(
      [link({ href: "/a" }), link({ href: "/a?utm=x" }), link({ href: "/a#top" })],
      ctx(),
    );
    expect(out).toHaveLength(1);
  });

  it("flags target=_blank", () => {
    const out = buildCandidates([link({ href: "/a", target: "_blank" })], ctx());
    expect(out[0]!.blank).toBe(true);
  });

  it("marks whether a link is in the viewport", () => {
    const out = buildCandidates(
      [
        link({ href: "/visible", rect: { x: 10, y: 10, width: 100, height: 20 } }),
        link({ href: "/below", rect: { x: 10, y: 2000, width: 100, height: 20 } }),
      ],
      ctx(),
    );
    expect(out.find((c) => c.path === "/visible")!.inViewport).toBe(true);
    expect(out.find((c) => c.path === "/below")!.inViewport).toBe(false);
  });

  it("puts hinted links first, then visible ones, then document order", () => {
    const out = buildCandidates(
      [
        link({ href: "/below", rect: { x: 0, y: 3000, width: 10, height: 10 } }),
        link({ href: "/visible" }),
        link({ href: "/hinted", rect: { x: 0, y: 4000, width: 10, height: 10 }, precog: "hint" }),
      ],
      ctx(),
    );
    expect(out.map((c) => c.path)).toEqual(["/hinted", "/visible", "/below"]);
    expect(out[0]!.hint).toBe(true);
  });

  it("caps the list and still ends with gapless ids", () => {
    const links = Array.from({ length: 10 }, (_, i) => link({ href: `/p${i}` }));
    const out = buildCandidates(links, ctx({ maxCandidates: 3 }));
    expect(out.map((c) => c.id)).toEqual(["l0", "l1", "l2"]);
  });

  it("returns nothing when the cap is zero or negative", () => {
    expect(buildCandidates([link()], ctx({ maxCandidates: 0 }))).toEqual([]);
    expect(buildCandidates([link()], ctx({ maxCandidates: -5 }))).toEqual([]);
  });

  it("collapses whitespace and truncates link text", () => {
    const out = buildCandidates([link({ href: "/a", text: `  a\n b  ${"x".repeat(200)}` })], ctx());
    expect(out[0]!.text.startsWith("a b ")).toBe(true);
    expect(out[0]!.text).toHaveLength(80);
  });

  it("drops link text when anchor text is off", () => {
    const out = buildCandidates(
      [link({ href: "/a", text: "secret" })],
      ctx({ sendAnchorText: false }),
    );
    expect(out[0]!.text).toBe("");
  });

  it("reports position in tenths of the viewport, clamped", () => {
    const out = buildCandidates(
      [
        link({ href: "/mid", rect: { x: 450, y: 380, width: 100, height: 40 } }),
        link({ href: "/far", rect: { x: 0, y: 100_000, width: 10, height: 10 } }),
      ],
      ctx(),
    );
    expect(out.find((c) => c.path === "/mid")!.position).toEqual({ x: 5, y: 5 });
    expect(out.find((c) => c.path === "/far")!.position.y).toBe(20);
  });

  it("survives a zero-sized viewport", () => {
    const out = buildCandidates([link({ href: "/a" })], ctx({ viewport: { width: 0, height: 0 } }));
    expect(out[0]!.position).toEqual({ x: 0, y: 0 });
  });

  it("honours include", () => {
    const out = buildCandidates(
      [link({ href: "/blog/a" }), link({ href: "/shop/a" })],
      ctx({ include: ["/blog/**"] }),
    );
    expect(out.map((c) => c.path)).toEqual(["/blog/a"]);
  });
});

describe("toWire", () => {
  it("removes the client-only fields", () => {
    const [candidate] = toWire(buildCandidates([link({ href: "/a" })], ctx()));
    expect(candidate).not.toHaveProperty("href");
    expect(candidate).not.toHaveProperty("blank");
    expect(candidate).toMatchObject({ id: "l0", path: "/a" });
  });
});

describe("fingerprint", () => {
  it("changes when the candidate paths change", () => {
    const a = buildCandidates([link({ href: "/a" })], ctx());
    const b = buildCandidates([link({ href: "/b" })], ctx());
    expect(fingerprint(a)).not.toBe(fingerprint(b));
    expect(fingerprint(a)).toBe(fingerprint(buildCandidates([link({ href: "/a" })], ctx())));
  });
});

import { describe, expect, it } from "vitest";
import { isAllowedPath, matchesAny } from "../src/match";

describe("matchesAny", () => {
  it("matches an exact path", () => {
    expect(matchesAny("/logout", ["/logout"])).toBe(true);
    expect(matchesAny("/logout/all", ["/logout"])).toBe(false);
  });

  it("keeps a single star inside one segment", () => {
    expect(matchesAny("/blog/hello", ["/blog/*"])).toBe(true);
    expect(matchesAny("/blog/2026/hello", ["/blog/*"])).toBe(false);
  });

  it("crosses slashes with a double star", () => {
    expect(matchesAny("/api/v1/users", ["/api/**"])).toBe(true);
    expect(matchesAny("/api", ["/api/**"])).toBe(false);
  });

  it("treats a question mark as one character", () => {
    expect(matchesAny("/a1", ["/a?"])).toBe(true);
    expect(matchesAny("/a12", ["/a?"])).toBe(false);
  });

  it("does not let glob characters escape into the regexp", () => {
    expect(matchesAny("/a.b", ["/a.b"])).toBe(true);
    expect(matchesAny("/axb", ["/a.b"])).toBe(false);
    expect(matchesAny("/a+b", ["/a+b"])).toBe(true);
  });

  it("matches nothing against an empty list", () => {
    expect(matchesAny("/anything", [])).toBe(false);
  });
});

describe("isAllowedPath", () => {
  const exclude = ["/logout", "/api/**", "/cart/**"];

  it("allows a plain path", () => {
    expect(isAllowedPath("/blog/hello", [], exclude)).toBe(true);
  });

  it("rejects an excluded path", () => {
    expect(isAllowedPath("/logout", [], exclude)).toBe(false);
    expect(isAllowedPath("/api/v1/users", [], exclude)).toBe(false);
  });

  it("ignores the query string when matching", () => {
    expect(isAllowedPath("/logout?next=/", [], exclude)).toBe(false);
    expect(isAllowedPath("/blog/hello?utm=x", [], exclude)).toBe(true);
  });

  it("restricts to include when it is set", () => {
    expect(isAllowedPath("/blog/hello", ["/blog/**"], exclude)).toBe(true);
    expect(isAllowedPath("/shop/hat", ["/blog/**"], exclude)).toBe(false);
  });

  it("lets exclude win over include", () => {
    expect(isAllowedPath("/blog/logout", ["/blog/**"], ["/blog/logout"])).toBe(false);
  });

  it("allows everything with no lists", () => {
    expect(isAllowedPath("/anything")).toBe(true);
  });
});

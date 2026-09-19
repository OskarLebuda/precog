import { describe, expect, it } from "vitest";
import { nativeRuleSet, serialize, toHrefPattern, toRuleSet } from "../src/runtime/core/rules.ts";
import type { PrecogPlan } from "../src/runtime/types.ts";

const origin = "https://example.com";

const plan = (over: Partial<PrecogPlan> = {}): PrecogPlan => ({
  decisions: [],
  prerender: [],
  prefetch: [],
  ...over,
});

describe("toRuleSet", () => {
  it("builds both rule kinds", () => {
    const rules = toRuleSet(
      plan({ prerender: [`${origin}/a`], prefetch: [`${origin}/b`, `${origin}/c`] }),
    );
    expect(rules).toMatchInlineSnapshot(`
      {
        "prefetch": [
          {
            "eagerness": "immediate",
            "source": "list",
            "tag": "precog",
            "urls": [
              "https://example.com/b",
              "https://example.com/c",
            ],
          },
        ],
        "prerender": [
          {
            "eagerness": "immediate",
            "source": "list",
            "tag": "precog",
            "urls": [
              "https://example.com/a",
            ],
          },
        ],
      }
    `);
  });

  it("omits the kind that has no urls", () => {
    expect(toRuleSet(plan({ prefetch: [`${origin}/b`] }))).not.toHaveProperty("prerender");
    expect(toRuleSet(plan({ prerender: [`${origin}/a`] }))).not.toHaveProperty("prefetch");
  });

  it("returns null for an empty plan", () => {
    expect(toRuleSet(plan())).toBe(null);
  });

  it("adds expects_no_vary_search only when asked", () => {
    const bare = toRuleSet(plan({ prefetch: [`${origin}/b`] }));
    expect(bare!.prefetch![0]).not.toHaveProperty("expects_no_vary_search");

    const withHint = toRuleSet(plan({ prefetch: [`${origin}/b`] }), {
      expectsNoVarySearch: 'params=("utm_source")',
    });
    expect(withHint!.prefetch![0]!.expects_no_vary_search).toBe('params=("utm_source")');
  });

  it("uses a custom tag", () => {
    const rules = toRuleSet(plan({ prefetch: [`${origin}/b`] }), { tag: "mine" });
    expect(rules!.prefetch![0]!.tag).toBe("mine");
  });

  it("copies the urls so later edits cannot reach the rules", () => {
    const urls = [`${origin}/b`];
    const rules = toRuleSet(plan({ prefetch: urls }));
    urls.push(`${origin}/z`);
    expect(rules!.prefetch![0]!.urls).toEqual([`${origin}/b`]);
  });
});

describe("toHrefPattern", () => {
  it("collapses a double star, which url patterns do not have", () => {
    expect(toHrefPattern("/api/**")).toBe("/api/*");
    expect(toHrefPattern("/blog/*")).toBe("/blog/*");
    expect(toHrefPattern("/logout")).toBe("/logout");
  });
});

describe("nativeRuleSet", () => {
  it("lets the browser decide, minus the excluded paths", () => {
    expect(nativeRuleSet({ exclude: ["/logout", "/api/**"] })).toMatchInlineSnapshot(`
      {
        "prefetch": [
          {
            "eagerness": "moderate",
            "source": "document",
            "tag": "precog-native",
            "where": {
              "and": [
                {
                  "href_matches": "/*",
                },
                {
                  "not": {
                    "href_matches": "/logout",
                  },
                },
                {
                  "not": {
                    "href_matches": "/api/*",
                  },
                },
              ],
            },
          },
        ],
      }
    `);
  });

  it("works with no exclusions", () => {
    const rules = nativeRuleSet();
    expect(rules.prefetch![0]!.where).toEqual({ and: [{ href_matches: "/*" }] });
  });
});

describe("serialize", () => {
  it("is stable for the same plan and empty for none", () => {
    const a = toRuleSet(plan({ prefetch: [`${origin}/b`] }));
    const b = toRuleSet(plan({ prefetch: [`${origin}/b`] }));
    expect(serialize(a)).toBe(serialize(b));
    expect(serialize(null)).toBe("");
  });
});

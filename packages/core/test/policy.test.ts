import { describe, expect, it } from "vitest";
import { canPredict, effectiveProbability, isSlow, plan, type PolicyContext } from "../src/policy";
import type { PrecogLink, PrecogPrediction } from "../src/types";

const origin = "https://example.com";

const links = (paths: string[], over: Partial<PrecogLink> = {}): PrecogLink[] =>
  paths.map((path, i) => ({
    id: `l${i}`,
    path,
    text: path,
    inViewport: true,
    position: { x: 5, y: 5 },
    href: origin + path,
    blank: false,
    ...over,
  }));

const prediction = (ranks: Array<[string, number]>, over: Partial<PrecogPrediction> = {}) =>
  ({
    ranks: ranks.map(([id, p]) => ({ id, p })),
    soon: 1,
    exit: 0,
    cached: false,
    latencyMs: 100,
    ...over,
  }) satisfies PrecogPrediction;

const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  mode: "auto",
  thresholds: { prefetch: 0.25, prerender: 0.6 },
  budget: { maxPrefetch: 3, maxPrerender: 1, maxCallsPerMinute: 20, maxCallsPerSession: 200 },
  ...over,
});

describe("isSlow", () => {
  it("only flags the two slow connection types", () => {
    expect(isSlow("2g")).toBe(true);
    expect(isSlow("slow-2g")).toBe(true);
    expect(isSlow("3g")).toBe(false);
    expect(isSlow(undefined)).toBe(false);
  });
});

describe("effectiveProbability", () => {
  it("discounts by the chance of leaving the site", () => {
    expect(effectiveProbability(0.8, 0.5)).toBeCloseTo(0.4);
    expect(effectiveProbability(0.8, 0)).toBeCloseTo(0.8);
  });

  it("clamps both inputs", () => {
    expect(effectiveProbability(5, -1)).toBe(1);
    expect(effectiveProbability(-1, 0)).toBe(0);
  });
});

describe("canPredict", () => {
  const base = {
    callsThisMinute: 0,
    callsThisSession: 0,
    budget: { maxPrefetch: 3, maxPrerender: 1, maxCallsPerMinute: 20, maxCallsPerSession: 200 },
  };

  it("allows a call by default", () => {
    expect(canPredict(base)).toBe(true);
  });

  it("stops without consent", () => {
    expect(canPredict({ ...base, consent: false })).toBe(false);
    expect(canPredict({ ...base, consent: true })).toBe(true);
  });

  it("stops in a hidden or prerendering document", () => {
    expect(canPredict({ ...base, hidden: true })).toBe(false);
    expect(canPredict({ ...base, prerendering: true })).toBe(false);
  });

  it("stops on a saving or slow connection", () => {
    expect(canPredict({ ...base, saveData: true })).toBe(false);
    expect(canPredict({ ...base, effectiveType: "slow-2g" })).toBe(false);
  });

  it("stops at the per-minute and per-session budgets", () => {
    expect(canPredict({ ...base, callsThisMinute: 20 })).toBe(false);
    expect(canPredict({ ...base, callsThisSession: 200 })).toBe(false);
    expect(canPredict({ ...base, callsThisMinute: 19, callsThisSession: 199 })).toBe(true);
  });
});

describe("plan", () => {
  it("prerenders the top link and prefetches the rest", () => {
    const result = plan(
      prediction([
        ["l0", 0.7],
        ["l1", 0.4],
        ["l2", 0.3],
      ]),
      links(["/a", "/b", "/c"]),
      ctx(),
    );
    expect(result.prerender).toEqual([`${origin}/a`]);
    expect(result.prefetch).toEqual([`${origin}/b`, `${origin}/c`]);
    expect(result.decisions.map((d) => d.action)).toEqual(["prerender", "prefetch", "prefetch"]);
  });

  it("sorts by probability, not by candidate order", () => {
    const result = plan(
      prediction([
        ["l0", 0.3],
        ["l1", 0.9],
      ]),
      links(["/a", "/b"]),
      ctx(),
    );
    expect(result.decisions[0]!.path).toBe("/b");
  });

  it("only prefetches in prefetch mode", () => {
    const result = plan(prediction([["l0", 0.95]]), links(["/a"]), ctx({ mode: "prefetch" }));
    expect(result.prerender).toEqual([]);
    expect(result.prefetch).toEqual([`${origin}/a`]);
  });

  it("only prerenders in prerender mode", () => {
    const result = plan(
      prediction([
        ["l0", 0.95],
        ["l1", 0.4],
      ]),
      links(["/a", "/b"]),
      ctx({ mode: "prerender" }),
    );
    expect(result.prerender).toEqual([`${origin}/a`]);
    expect(result.prefetch).toEqual([]);
  });

  it("does not prerender when a navigation is not expected soon", () => {
    const result = plan(prediction([["l0", 0.9]], { soon: 0.2 }), links(["/a"]), ctx());
    expect(result.prerender).toEqual([]);
    expect(result.prefetch).toEqual([`${origin}/a`]);
  });

  it("never prerenders a target=_blank link but may prefetch it", () => {
    const result = plan(prediction([["l0", 0.9]]), links(["/a"], { blank: true }), ctx());
    expect(result.prerender).toEqual([]);
    expect(result.prefetch).toEqual([`${origin}/a`]);
  });

  it("respects the prefetch and prerender budgets", () => {
    const result = plan(
      prediction([
        ["l0", 0.9],
        ["l1", 0.85],
        ["l2", 0.8],
        ["l3", 0.75],
        ["l4", 0.7],
      ]),
      links(["/a", "/b", "/c", "/d", "/e"]),
      ctx({ budget: { ...ctx().budget, maxPrefetch: 2, maxPrerender: 1 } }),
    );
    expect(result.prerender).toHaveLength(1);
    expect(result.prefetch).toHaveLength(2);
    expect(result.decisions.at(-1)).toMatchObject({ action: "none", reason: "budget" });
  });

  it("leaves low-probability links alone", () => {
    const result = plan(prediction([["l0", 0.1]]), links(["/a"]), ctx());
    expect(result.decisions[0]).toMatchObject({ action: "none", reason: "below threshold" });
  });

  it("scales probabilities down by the chance of leaving", () => {
    const result = plan(prediction([["l0", 0.4]], { exit: 0.5 }), links(["/a"]), ctx());
    expect(result.decisions[0]).toMatchObject({ action: "none", p: 0.2 });
  });

  it("drops excluded paths even when Jev ranks them first", () => {
    const result = plan(
      prediction([["l0", 0.99]]),
      links(["/logout"]),
      ctx({ exclude: ["/logout"] }),
    );
    expect(result.prerender).toEqual([]);
    expect(result.prefetch).toEqual([]);
    expect(result.decisions[0]).toMatchObject({ action: "none", reason: "excluded" });
  });

  it("dedupes links that resolve to the same URL", () => {
    const same = links(["/a", "/a"]);
    same[1]!.id = "l1";
    const result = plan(
      prediction([
        ["l0", 0.9],
        ["l1", 0.5],
      ]),
      same,
      ctx(),
    );
    expect(result.prerender).toEqual([`${origin}/a`]);
    expect(result.prefetch).toEqual([]);
    expect(result.decisions[1]).toMatchObject({ action: "none", reason: "duplicate" });
  });

  it("ignores ranks for ids that were never sent", () => {
    const result = plan(
      prediction([
        ["l0", 0.9],
        ["ghost", 0.99],
        ["none", 0.5],
      ]),
      links(["/a"]),
      ctx(),
    );
    expect(result.decisions).toHaveLength(1);
    expect(result.prerender).toEqual([`${origin}/a`]);
  });

  it("does nothing while the tab is hidden or the document is prerendering", () => {
    const high = prediction([["l0", 0.99]]);
    expect(plan(high, links(["/a"]), ctx({ hidden: true })).prefetch).toEqual([]);
    expect(plan(high, links(["/a"]), ctx({ prerendering: true })).prefetch).toEqual([]);
  });

  it("does nothing on a saving or slow connection", () => {
    const high = prediction([["l0", 0.99]]);
    expect(plan(high, links(["/a"]), ctx({ saveData: true })).decisions).toEqual([]);
    expect(plan(high, links(["/a"]), ctx({ effectiveType: "2g" })).decisions).toEqual([]);
  });

  it("keeps an active speculation while it stays near its threshold", () => {
    const wobble = prediction([["l0", 0.5]]);
    const cold = plan(wobble, links(["/a"]), ctx());
    expect(cold.prerender).toEqual([]);

    const warm = plan(
      wobble,
      links(["/a"]),
      ctx({ active: { prerender: [`${origin}/a`], prefetch: [] } }),
    );
    expect(warm.prerender).toEqual([`${origin}/a`]);
  });

  it("still drops an active speculation once it falls far enough", () => {
    const result = plan(
      prediction([["l0", 0.3]]),
      links(["/a"]),
      ctx({ active: { prerender: [`${origin}/a`], prefetch: [] } }),
    );
    expect(result.prerender).toEqual([]);
    expect(result.prefetch).toEqual([`${origin}/a`]);
  });

  it("returns an empty plan when there is nothing to rank", () => {
    expect(plan(prediction([]), [], ctx())).toEqual({ decisions: [], prerender: [], prefetch: [] });
  });
});

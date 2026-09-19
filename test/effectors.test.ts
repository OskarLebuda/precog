// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { SpeculationEffector, supportsSpeculationRules } from "../src/runtime/core/effectors.ts";
import { nativeRuleSet, toRuleSet } from "../src/runtime/core/rules.ts";
import { readLinks } from "../src/runtime/core/signals.ts";

const rules = toRuleSet({
  decisions: [],
  prerender: ["https://example.com/a"],
  prefetch: ["https://example.com/b", "https://example.com/c"],
})!;

const scripts = () => document.head.querySelectorAll('script[type="speculationrules"]');
const prefetchLinks = () => document.head.querySelectorAll('link[rel="prefetch"]');

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("supportsSpeculationRules", () => {
  it("says no where HTMLScriptElement.supports is missing", () => {
    expect(supportsSpeculationRules()).toBe(false);
  });
});

describe("SpeculationEffector with speculation rules", () => {
  it("writes exactly one tagged script", () => {
    const effector = new SpeculationEffector(document, true);
    effector.apply(rules);
    expect(scripts()).toHaveLength(1);
    const script = scripts()[0] as HTMLScriptElement;
    expect(script.dataset.precog).toBe("precog");
    expect(JSON.parse(script.textContent!)).toEqual(rules);
  });

  it("replaces its script rather than adding another", () => {
    const effector = new SpeculationEffector(document, true);
    effector.apply(rules);
    effector.apply(
      toRuleSet({ decisions: [], prerender: [], prefetch: ["https://example.com/z"] }),
    );
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]!.textContent).toContain("/z");
  });

  it("does nothing when the rules did not change", () => {
    const effector = new SpeculationEffector(document, true);
    expect(effector.apply(rules)).toBe(true);
    expect(effector.apply(toRuleSet({ decisions: [], ...rulesPlan() }))).toBe(false);
    expect(scripts()).toHaveLength(1);
  });

  it("removes the script when there is nothing to speculate", () => {
    const effector = new SpeculationEffector(document, true);
    effector.apply(rules);
    effector.clear();
    expect(scripts()).toHaveLength(0);
    expect(effector.current).toBe("");
  });

  it("writes the native fallback the same way", () => {
    const effector = new SpeculationEffector(document, true);
    effector.apply(nativeRuleSet({ exclude: ["/logout"] }));
    expect(scripts()[0]!.textContent).toContain('"eagerness":"moderate"');
  });

  it("leaves scripts it does not own alone", () => {
    const foreign = document.createElement("script");
    foreign.type = "speculationrules";
    foreign.textContent = "{}";
    document.head.append(foreign);
    const effector = new SpeculationEffector(document, true);
    effector.apply(rules);
    effector.clear();
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]).toBe(foreign);
  });
});

describe("SpeculationEffector without speculation rules", () => {
  it("falls back to prefetch links and skips prerender", () => {
    const effector = new SpeculationEffector(document, false);
    effector.apply(rules);
    expect(scripts()).toHaveLength(0);
    expect(
      [...prefetchLinks()].map((link) => (link as HTMLLinkElement).getAttribute("href")),
    ).toEqual(["https://example.com/b", "https://example.com/c"]);
  });

  it("removes its links on the next decision", () => {
    const effector = new SpeculationEffector(document, false);
    effector.apply(rules);
    effector.clear();
    expect(prefetchLinks()).toHaveLength(0);
  });
});

describe("readLinks", () => {
  it("reads every visible anchor with its attributes", () => {
    document.body.innerHTML = `
      <a href="/a" data-precog="hint">A</a>
      <a href="/b" download target="_blank">B</a>
      <a>no href</a>
    `;
    // happy-dom gives every element a zero box, so measure through a stub instead.
    for (const anchor of document.querySelectorAll("a")) {
      anchor.getBoundingClientRect = () => ({ x: 1, y: 2, width: 100, height: 20 }) as DOMRect;
    }
    const links = readLinks();
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ text: "A", precog: "hint", download: false });
    expect(links[1]).toMatchObject({ download: true, target: "_blank", precog: null });
  });

  it("skips anchors with no box", () => {
    document.body.innerHTML = '<a href="/a">A</a>';
    expect(readLinks()).toEqual([]);
  });
});

function rulesPlan() {
  return {
    prerender: ["https://example.com/a"],
    prefetch: ["https://example.com/b", "https://example.com/c"],
  };
}

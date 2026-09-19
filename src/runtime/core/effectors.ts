/** Puts a plan into the document: speculation rules, or a prefetch link where they are missing. */

import { serialize } from "./rules.ts";
import type { PrecogRuleSet } from "../types.ts";

/** Marks the one script and the links this module owns, so it only ever replaces its own. */
export const MARKER = "precog";

export function supportsSpeculationRules(): boolean {
  return (
    typeof HTMLScriptElement !== "undefined" &&
    typeof HTMLScriptElement.supports === "function" &&
    HTMLScriptElement.supports("speculationrules")
  );
}

/**
 * Owns exactly one `<script type="speculationrules">`. The whole script is replaced on every
 * new decision, because a rule set is read once when it is inserted.
 */
export class SpeculationEffector {
  #script: HTMLScriptElement | null = null;
  #links: HTMLLinkElement[] = [];
  #current = "";
  readonly supported: boolean;

  constructor(
    private readonly document: Document = globalThis.document,
    supported = supportsSpeculationRules(),
  ) {
    this.supported = supported;
  }

  /** The rule set in the document right now, for the overlay and for tests. */
  get current(): string {
    return this.#current;
  }

  /** Writes a rule set, or clears it when there is nothing to speculate. Returns true if changed. */
  apply(rules: PrecogRuleSet | null): boolean {
    const next = serialize(rules);
    if (next === this.#current) return false;
    this.#current = next;
    this.#clearDom();
    if (!rules) return true;
    if (this.supported) this.#writeScript(rules);
    else this.#writeLinks(rules);
    return true;
  }

  clear() {
    this.apply(null);
  }

  #writeScript(rules: PrecogRuleSet) {
    const script = this.document.createElement("script");
    script.type = "speculationrules";
    script.dataset.precog = MARKER;
    script.textContent = JSON.stringify(rules);
    this.document.head.append(script);
    this.#script = script;
  }

  /** Without speculation rules, prefetch is the only thing left; prerender has no fallback. */
  #writeLinks(rules: PrecogRuleSet) {
    const urls = (rules.prefetch ?? []).flatMap(
      (rule) => (rule.urls as string[] | undefined) ?? [],
    );
    for (const url of urls) {
      const link = this.document.createElement("link");
      link.rel = "prefetch";
      link.href = url;
      link.dataset.precog = MARKER;
      this.document.head.append(link);
      this.#links.push(link);
    }
  }

  #clearDom() {
    this.#script?.remove();
    this.#script = null;
    for (const link of this.#links) link.remove();
    this.#links = [];
  }
}

/** Turns a plan into speculation rules JSON. Pure, snapshot tested. */

import type { PrecogPlan, PrecogRuleSet } from "../types";

/** Reflected in the `Sec-Speculation-Tags` request header, so these loads can be told apart. */
export const TAG = "precog";
export const NATIVE_TAG = "precog-native";

export interface RuleOptions {
  /** ASCII tag sent in `Sec-Speculation-Tags`. */
  tag?: string;
  /**
   * A `No-Vary-Search` header value, for example `params=("utm_source")`. Set it when query
   * parameters do not change the response, so one speculated load serves several URLs.
   */
  expectsNoVarySearch?: string;
  /** Path globs kept out of the native fallback's document rule. */
  exclude?: readonly string[];
}

function listRule(urls: readonly string[], options: RuleOptions) {
  return {
    source: "list" as const,
    urls: [...urls],
    // List rules default to `immediate`, which is what we want: the policy already decided.
    eagerness: "immediate" as const,
    tag: options.tag ?? TAG,
    ...(options.expectsNoVarySearch ? { expects_no_vary_search: options.expectsNoVarySearch } : {}),
  };
}

/** The rule set for a plan, or `null` when there is nothing to speculate. */
export function toRuleSet(plan: PrecogPlan, options: RuleOptions = {}): PrecogRuleSet | null {
  const rules: PrecogRuleSet = {};
  if (plan.prerender.length > 0) rules.prerender = [listRule(plan.prerender, options)];
  if (plan.prefetch.length > 0) rules.prefetch = [listRule(plan.prefetch, options)];
  return rules.prerender || rules.prefetch ? rules : null;
}

/** A path glob as a `href_matches` pattern. URL patterns already cross slashes with `*`. */
export function toHrefPattern(glob: string): string {
  return glob.replace(/\*\*/g, "*");
}

/**
 * The `fallback: "native"` rule set: let the browser decide from pointer intent, minus the
 * paths the visitor must never navigate to by accident.
 */
export function nativeRuleSet(options: RuleOptions = {}): PrecogRuleSet {
  const blocked = (options.exclude ?? []).map((glob) => ({
    not: { href_matches: toHrefPattern(glob) },
  }));
  return {
    prefetch: [
      {
        source: "document",
        eagerness: "moderate",
        where: { and: [{ href_matches: "/*" }, ...blocked] },
        tag: options.tag ?? NATIVE_TAG,
      },
    ],
  };
}

/** Stable JSON for a rule set, used to skip a DOM write when nothing changed. */
export function serialize(rules: PrecogRuleSet | null): string {
  return rules ? JSON.stringify(rules) : "";
}

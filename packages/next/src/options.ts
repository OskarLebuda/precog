/** Options shared by the route handler and the provider. */

import type { PrecogBudget, PrecogPrivacy, PrecogPublicOptions } from "@precog/core";

/** What the browser half needs. Everything has a default, so `<PrecogProvider />` is enough. */
export type PrecogOptions = Partial<Omit<PrecogPublicOptions, "enabled">> & {
  enabled?: boolean;
};

export const DEFAULT_ENDPOINT = "/api/precog";

export const defaults: PrecogPublicOptions = {
  enabled: true,
  endpoint: DEFAULT_ENDPOINT,
  mode: "prefetch",
  thresholds: { prefetch: 0.25, prerender: 0.6 },
  budget: {
    maxPrefetch: 3,
    maxPrerender: 1,
    maxCallsPerMinute: 20,
    maxCallsPerSession: 200,
  },
  maxCandidates: 30,
  timeoutMs: 1500,
  minIntervalMs: 1200,
  fallback: "native",
  include: [],
  exclude: ["/logout", "/signout", "/api/**", "/auth/**", "/cart/**"],
  privacy: {
    sendQuery: false,
    sendAnchorText: true,
    sendHistory: true,
    requireConsent: false,
  },
  overlay: false,
  documentNavigation: false,
};

/** Fills in the defaults one level deep, which is as deep as the options go. */
export function withDefaults(options: PrecogOptions = {}): PrecogPublicOptions {
  return {
    ...defaults,
    ...options,
    thresholds: { ...defaults.thresholds, ...options.thresholds },
    budget: { ...defaults.budget, ...options.budget } as PrecogBudget,
    privacy: { ...defaults.privacy, ...options.privacy } as PrecogPrivacy,
  };
}

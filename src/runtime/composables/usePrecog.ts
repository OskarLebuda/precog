import { useNuxtApp } from "#app";
import type { Precog } from "../core/orchestrator.ts";

export interface UsePrecog {
  /** False while paused, or before consent when `privacy.requireConsent` is on. */
  readonly enabled: boolean;
  /** Stops predicting and removes the speculation rules. */
  pause: () => void;
  resume: () => void;
  /** Predicts again now, ignoring `minIntervalMs`. */
  refresh: () => void;
  /** Lets the module run when `privacy.requireConsent` is on. */
  grantConsent: () => void;
  /** Counters, latencies, hit rate and the estimated cost. */
  readonly metrics: Precog["metrics"];
  /** The current plan, or null when nothing is speculated. */
  readonly plan: Precog["plan"];
}

/** A no-op on the server and when the module is off, so a page can call it unconditionally. */
const noop: UsePrecog = {
  enabled: false,
  pause: () => {},
  resume: () => {},
  refresh: () => {},
  grantConsent: () => {},
  get metrics() {
    return undefined as unknown as Precog["metrics"];
  },
  plan: null,
};

export function usePrecog(): UsePrecog {
  const precog = useNuxtApp().$precog as Precog | undefined;
  if (!precog) return noop;
  return {
    get enabled() {
      return precog.enabled && precog.consent;
    },
    pause: () => precog.pause(),
    resume: () => precog.resume(),
    refresh: () => precog.refresh(),
    grantConsent: () => precog.grantConsent(),
    get metrics() {
      return precog.metrics;
    },
    get plan() {
      return precog.plan;
    },
  };
}

"use client";

import type { MetricsSummary } from "@precog/core/client";
import type { PrecogPlan } from "@precog/core";
import { usePrecogContext } from "./provider";

export interface UsePrecog {
  /** False while paused, or before consent when `privacy.requireConsent` is on. */
  enabled: boolean;
  /** Stops predicting and removes the speculation rules until `resume()`. */
  pause: () => void;
  resume: () => void;
  /** Predicts now, ignoring `minIntervalMs`. */
  refresh: () => void;
  /** Lets the module run when `privacy.requireConsent` is on. */
  grantConsent: () => void;
  /** Counters, latency percentiles, hit rate and the estimated cost. */
  metrics: MetricsSummary | null;
  /** What is speculated right now, or null. */
  plan: PrecogPlan | null;
}

const noop = () => {};

/** Safe to call anywhere under `<PrecogProvider>`, including before it has started. */
export function usePrecog(): UsePrecog {
  const { precog, plan, metrics } = usePrecogContext();
  return {
    enabled: precog ? precog.enabled && precog.consent : false,
    pause: precog ? () => precog.pause() : noop,
    resume: precog ? () => precog.resume() : noop,
    refresh: precog ? () => precog.refresh() : noop,
    grantConsent: precog ? () => precog.grantConsent() : noop,
    metrics,
    plan,
  };
}

/** Counts what the module did and how well it guessed. In memory, mirrored to sessionStorage. */

import type { PrecogMetrics } from "../types.ts";

const KEY = "precog:metrics";

export const emptyMetrics = (): PrecogMetrics => ({
  calls: 0,
  cacheHits: 0,
  errors: 0,
  latencies: [],
  hits: 0,
  topHits: 0,
  navigations: 0,
  wasted: 0,
  inputTokens: 0,
  outputTokens: 0,
  activations: 0,
});

/** Latencies are kept for percentiles; a session does not need more than this many. */
const MAX_LATENCIES = 200;

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

export interface Pricing {
  /** Dollars per million input tokens. */
  inputPerMillion: number;
  /** Dollars per million output tokens. */
  outputPerMillion: number;
}

/** An estimate, and only as good as the prices the user configured. */
export function estimateCost(metrics: PrecogMetrics, pricing?: Pricing): number | null {
  if (!pricing) return null;
  return (
    (metrics.inputTokens * pricing.inputPerMillion +
      metrics.outputTokens * pricing.outputPerMillion) /
    1_000_000
  );
}

export interface MetricsSummary extends PrecogMetrics {
  p50: number;
  p95: number;
  /** Share of navigations where the clicked link was already being loaded. */
  hitRate: number;
  /** Share of navigations where the clicked link was the top ranked one. */
  topAccuracy: number;
  /** Estimated dollars spent, or null when no prices are configured. */
  cost: number | null;
}

export function summarize(metrics: PrecogMetrics, pricing?: Pricing): MetricsSummary {
  return {
    ...metrics,
    p50: percentile(metrics.latencies, 50),
    p95: percentile(metrics.latencies, 95),
    hitRate: metrics.navigations === 0 ? 0 : metrics.hits / metrics.navigations,
    topAccuracy: metrics.navigations === 0 ? 0 : metrics.topHits / metrics.navigations,
    cost: estimateCost(metrics, pricing),
  };
}

export class Telemetry {
  metrics: PrecogMetrics = emptyMetrics();

  constructor(private readonly storage?: Storage) {
    this.#load();
  }

  record(patch: Partial<PrecogMetrics>) {
    const counters = this.metrics as unknown as Record<string, number>;
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === "number") counters[key] = (counters[key] ?? 0) + value;
    }
    this.#save();
  }

  recordLatency(ms: number) {
    this.metrics.latencies.push(ms);
    if (this.metrics.latencies.length > MAX_LATENCIES) this.metrics.latencies.shift();
    this.#save();
  }

  reset() {
    this.metrics = emptyMetrics();
    this.#save();
  }

  summary(pricing?: Pricing): MetricsSummary {
    return summarize(this.metrics, pricing);
  }

  #load() {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) this.metrics = { ...emptyMetrics(), ...(JSON.parse(raw) as PrecogMetrics) };
    } catch {
      // A private window or a full quota is not a reason to stop.
    }
  }

  #save() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.metrics));
    } catch {
      // As above.
    }
  }
}

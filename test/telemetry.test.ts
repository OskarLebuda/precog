import { describe, expect, it } from "vitest";
import {
  Telemetry,
  emptyMetrics,
  estimateCost,
  percentile,
  summarize,
} from "../src/runtime/core/telemetry.ts";

function fakeStorage(seed?: string): Storage {
  const map = new Map<string, string>();
  if (seed) map.set("precog:metrics", seed);
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe("percentile", () => {
  it("picks the value at the rank", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(100);
    expect(percentile(values, 0)).toBe(10);
  });

  it("is zero with nothing to rank", () => {
    expect(percentile([], 50)).toBe(0);
  });
});

describe("estimateCost", () => {
  it("returns null without prices, because none are published", () => {
    expect(estimateCost(emptyMetrics())).toBe(null);
  });

  it("multiplies tokens by the configured prices", () => {
    const metrics = { ...emptyMetrics(), inputTokens: 1_000_000, outputTokens: 500_000 };
    expect(estimateCost(metrics, { inputPerMillion: 2, outputPerMillion: 4 })).toBe(4);
  });
});

describe("summarize", () => {
  it("derives the rates and percentiles", () => {
    const summary = summarize({
      ...emptyMetrics(),
      latencies: [100, 200, 300, 400],
      navigations: 4,
      hits: 3,
      topHits: 2,
    });
    expect(summary.p50).toBe(200);
    expect(summary.hitRate).toBe(0.75);
    expect(summary.topAccuracy).toBe(0.5);
  });

  it("does not divide by zero before the first navigation", () => {
    const summary = summarize(emptyMetrics());
    expect(summary.hitRate).toBe(0);
    expect(summary.topAccuracy).toBe(0);
  });
});

describe("Telemetry", () => {
  it("adds up counters and keeps latencies", () => {
    const telemetry = new Telemetry();
    telemetry.record({ calls: 1, hits: 1 });
    telemetry.record({ calls: 2 });
    telemetry.recordLatency(120);
    expect(telemetry.metrics.calls).toBe(3);
    expect(telemetry.metrics.hits).toBe(1);
    expect(telemetry.metrics.latencies).toEqual([120]);
  });

  it("keeps the latency window bounded", () => {
    const telemetry = new Telemetry();
    for (let i = 0; i < 250; i++) telemetry.recordLatency(i);
    expect(telemetry.metrics.latencies).toHaveLength(200);
    expect(telemetry.metrics.latencies[0]).toBe(50);
  });

  it("restores counters from storage and writes them back", () => {
    const storage = fakeStorage();
    new Telemetry(storage).record({ calls: 5 });
    expect(new Telemetry(storage).metrics.calls).toBe(5);
  });

  it("ignores rubbish in storage", () => {
    expect(new Telemetry(fakeStorage("not json")).metrics.calls).toBe(0);
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    const telemetry = new Telemetry(broken);
    telemetry.record({ calls: 1 });
    expect(telemetry.metrics.calls).toBe(1);
  });

  it("resets", () => {
    const telemetry = new Telemetry();
    telemetry.record({ calls: 3 });
    telemetry.reset();
    expect(telemetry.metrics.calls).toBe(0);
  });
});

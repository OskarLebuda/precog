import { describe, expect, it } from "vitest";
import { emptyMetrics, Telemetry } from "../src/runtime/core/telemetry";

describe("lastError", () => {
  it("starts empty", () => {
    expect(emptyMetrics().lastError).toBe("");
  });

  it("keeps the newest reason and clears on success", () => {
    const t = new Telemetry();
    t.record({ errors: 1, lastError: "APIError 401: bad key" });
    expect(t.metrics.lastError).toBe("APIError 401: bad key");
    t.record({ errors: 1, lastError: "TimeoutError" });
    expect(t.metrics.lastError).toBe("TimeoutError");
    expect(t.metrics.errors).toBe(2);
    t.record({ lastError: "" });
    expect(t.metrics.lastError).toBe("");
  });
});

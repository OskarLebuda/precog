import { describe, expect, it } from "vitest";
import { RateLimiter, take } from "../src/server/ratelimit";

const limit = { capacity: 3, windowMs: 60_000 };

describe("take", () => {
  it("starts full and empties one token at a time", () => {
    let bucket = take(undefined, limit, 0).bucket;
    expect(bucket.tokens).toBe(2);
    bucket = take(bucket, limit, 0).bucket;
    bucket = take(bucket, limit, 0).bucket;
    expect(bucket.tokens).toBe(0);
  });

  it("refuses once the bucket is empty and says when to retry", () => {
    let bucket = take(undefined, limit, 0).bucket;
    bucket = take(bucket, limit, 0).bucket;
    bucket = take(bucket, limit, 0).bucket;
    const blocked = take(bucket, limit, 0);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(20_000);
  });

  it("refills over time and never past the capacity", () => {
    const empty = { tokens: 0, at: 0 };
    expect(take(empty, limit, 20_000).ok).toBe(true);
    expect(take(empty, limit, 10 * 60_000).bucket.tokens).toBe(limit.capacity - 1);
  });

  it("ignores a clock that goes backwards", () => {
    const bucket = { tokens: 1, at: 1000 };
    expect(take(bucket, limit, 0).bucket.tokens).toBe(0);
  });
});

describe("RateLimiter", () => {
  it("keeps one bucket per key", () => {
    const limiter = new RateLimiter(limit);
    for (let i = 0; i < 3; i++) expect(limiter.check("a", 0).ok).toBe(true);
    expect(limiter.check("a", 0).ok).toBe(false);
    expect(limiter.check("b", 0).ok).toBe(true);
  });

  it("evicts the least recently seen key", () => {
    const limiter = new RateLimiter(limit, 2);
    limiter.check("a", 0);
    limiter.check("b", 0);
    limiter.check("a", 0);
    limiter.check("c", 0);
    // "b" was evicted, so it starts from a full bucket again.
    expect(limiter.check("b", 0).bucket.tokens).toBe(limit.capacity - 1);
  });
});

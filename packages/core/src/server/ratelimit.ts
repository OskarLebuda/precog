/** Token bucket per caller. The endpoint costs money, so it is rate limited by default. */

export interface Bucket {
  /** Tokens left, fractional between refills. */
  tokens: number;
  /** When the bucket was last refilled. */
  at: number;
}

export interface Limit {
  /** Most calls in a burst. */
  capacity: number;
  /** How long the bucket takes to refill from empty. */
  windowMs: number;
}

/** Takes one token, returning the new bucket and whether the call is allowed. */
export function take(bucket: Bucket | undefined, limit: Limit, now: number) {
  const rate = limit.capacity / limit.windowMs;
  const current = bucket
    ? Math.min(limit.capacity, bucket.tokens + Math.max(0, now - bucket.at) * rate)
    : limit.capacity;
  if (current < 1) {
    const retryAfterMs = Math.ceil((1 - current) / rate);
    return { ok: false as const, bucket: { tokens: current, at: now }, retryAfterMs };
  }
  return { ok: true as const, bucket: { tokens: current - 1, at: now }, retryAfterMs: 0 };
}

/** In-memory buckets, evicted oldest first. Per worker, which is enough as a default. */
export class RateLimiter {
  #buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: Limit,
    private readonly maxKeys = 10_000,
  ) {}

  check(key: string, now = Date.now()) {
    const result = take(this.#buckets.get(key), this.limit, now);
    // Re-inserting moves the key to the end, so eviction drops the least recently seen.
    this.#buckets.delete(key);
    this.#buckets.set(key, result.bucket);
    if (this.#buckets.size > this.maxKeys) {
      const oldest = this.#buckets.keys().next().value;
      if (oldest !== undefined) this.#buckets.delete(oldest);
    }
    return result;
  }
}

/**
 * Cache key for a prediction. Page context dominates the answer, so micro pointer movement
 * must not bust the key or the endpoint would call Jev on every scroll frame.
 */

import type { PrecogState } from "../types";

/** FNV-1a over the key material. No Node APIs, so it runs on every edge runtime. */
export function hash(input: string): string {
  let h1 = 0x81_1c_9d_c5;
  let h2 = 0x01_00_01_93;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01_00_01_93);
    h2 = Math.imul(h2 ^ code, 0x81_1c_9d_c5);
  }
  return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)).padStart(12, "0");
}

/** Reading progress in quarters, so scrolling a little does not make a new key. */
const bucketDepth = (depth: number) => Math.round(depth * 4) / 4;

/** Time on page in 10 second steps, capped, so a slow reader lands in one bucket. */
const bucketTime = (ms: number) => Math.min(12, Math.floor(ms / 10_000));

export function cacheKey(state: PrecogState, model: string): string {
  const candidates = state.candidates
    .map((candidate) => `${candidate.path}${candidate.inViewport ? "+" : "-"}`)
    .sort()
    .join(",");
  const material = [
    model,
    state.page.path,
    candidates,
    bucketDepth(state.session.scrollDepth),
    bucketTime(state.session.timeOnPageMs),
    // Which link is under or ahead of the cursor matters; the exact pixels do not.
    state.pointer.hoveredId ?? "",
    state.pointer.nearestIds.join("|"),
    state.session.previousPaths.at(-1) ?? "",
  ].join("\u0000");
  return `precog:${hash(material)}`;
}

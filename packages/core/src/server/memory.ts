/**
 * A prediction cache for runtimes that do not bring one. Nitro has its own storage; a bare
 * Node or edge process does not.
 *
 * Entries expire on read and the map is swept when it outgrows `maxEntries`, so a long-lived
 * server cannot grow without bound.
 */

import type { PredictStorage } from "./predict";

interface Entry {
  value: unknown;
  expires: number;
}

export function createMemoryStorage(maxEntries = 500, now = Date.now): PredictStorage {
  const entries = new Map<string, Entry>();

  const sweep = () => {
    const at = now();
    for (const [key, entry] of entries) if (entry.expires <= at) entries.delete(key);
    // Still too many after dropping the stale ones: evict the least recently written.
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };

  return {
    getItem(key) {
      const entry = entries.get(key);
      if (!entry) return Promise.resolve(null);
      if (entry.expires <= now()) {
        entries.delete(key);
        return Promise.resolve(null);
      }
      return Promise.resolve(entry.value);
    },
    setItem(key, value, options) {
      const ttl = options?.ttl ?? 0;
      if (ttl <= 0) return Promise.resolve();
      // Re-inserting moves the key to the end, which is what makes eviction least-recent.
      entries.delete(key);
      entries.set(key, { value, expires: now() + ttl * 1000 });
      if (entries.size > maxEntries) sweep();
      return Promise.resolve();
    },
  };
}

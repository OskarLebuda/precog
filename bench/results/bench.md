# Benchmark

8 synthetic sessions per arm, 6 navigations each, real Chrome against
a production build, throttled to 250 ms of latency and 2000 kbit/s down.

| arm                         | off      | native   | precog       |
| --------------------------- | -------- | -------- | ------------ |
| navigation median           | 147 ms   | 145 ms   | 68 ms        |
| navigation p95              | 404 ms   | 397 ms   | 395 ms       |
| hit rate                    | n/a      | n/a      | 29%          |
| top guess correct           | n/a      | n/a      | 17%          |
| speculative loads / session | 18.3     | 24.8     | 33.4         |
| wasted loads / session      | 2.0      | 2.0      | 2.6          |
| wasted kB / session         | 6.9      | 6.9      | 10.3         |
| jev calls / session         | 0.0      | 0.0      | 14.9         |
| jev answered from cache     | n/a      | n/a      | 17%          |
| jev latency p50 / p95       | 0 / 0 ms | 0 / 0 ms | 372 / 622 ms |
| tokens / session            | 0        | 0        | 10398        |
| cost / session              | n/a      | n/a      | n/a          |

## How to read this

- The visitors are synthetic. Their click model weights links by position, so hit rate and
  accuracy say how well the module does against that model, not against real people.
- Timings are real. They are wall-clock milliseconds from the click to the new page's heading.
- Predictions came from Jev itself. Latency and token figures are real.
- No prices were given, so cost is not reported. TypeSafe does not publish one.
- The three arms are not "nothing, something, precog". The playground sets
  `takeOverNuxtLinkPrefetch`, so in every arm `NuxtLink` still prefetches a link the cursor
  actually rests on. `off` therefore means "the browser and Nuxt on their own", which is a
  much stronger baseline than doing nothing, and it is the one worth beating.
- `native` is the honest competitor: document rules at `eagerness: moderate` cost nothing and
  need no model. Where precog only ties it, say so.

Generated 2026-09-19T19:39:39.278Z.

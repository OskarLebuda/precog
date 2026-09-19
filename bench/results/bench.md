# Benchmark

8 synthetic sessions per arm, 6 navigations each, real Chrome against
a production build, throttled to 250 ms of latency and 2000 kbit/s down.

| arm                         | off      | native   | precog     |
| --------------------------- | -------- | -------- | ---------- |
| navigation median           | 145 ms   | 142 ms   | 63 ms      |
| navigation p95              | 403 ms   | 403 ms   | 389 ms     |
| hit rate                    | n/a      | n/a      | 46%        |
| top guess correct           | n/a      | n/a      | 27%        |
| speculative loads / session | 18.3     | 24.8     | 51.6       |
| wasted loads / session      | 2.0      | 2.0      | 4.0        |
| wasted kB / session         | 6.9      | 6.9      | 18.6       |
| jev calls / session         | 0.0      | 0.0      | 14.6       |
| jev answered from cache     | n/a      | n/a      | 18%        |
| jev latency p50 / p95       | 0 / 0 ms | 0 / 0 ms | 90 / 90 ms |
| tokens / session            | 0        | 0        | 2858       |
| cost / session              | n/a      | n/a      | n/a        |

## How to read this

- The visitors are synthetic. Their click model weights links by position, so hit rate and
  accuracy say how well the module does against that model, not against real people.
- Timings are real. They are wall-clock milliseconds from the click to the new page's heading.
- Predictions in this run came from the playground's stand-in, not from Jev.
  Latency and token figures are therefore made up and only the shape of the pipeline is real.
- No prices were given, so cost is not reported. TypeSafe does not publish one.
- The three arms are not "nothing, something, precog". The playground sets
  `takeOverNuxtLinkPrefetch`, so in every arm `NuxtLink` still prefetches a link the cursor
  actually rests on. `off` therefore means "the browser and Nuxt on their own", which is a
  much stronger baseline than doing nothing, and it is the one worth beating.
- `native` is the honest competitor: document rules at `eagerness: moderate` cost nothing and
  need no model. Where precog only ties it, say so.

Generated 2026-09-19T12:33:14.307Z.

# Launch assets

## Recording

`pnpm dev:build && pnpm record` writes three files to `bench/results`:

- `off.webm` and `precog.webm`, the same scripted visit in both arms
- `precog-demo.mp4`, the two side by side, about 25 seconds

The visit is a chain of five docs pages. The browser is throttled to 300 ms of latency, the
cursor travels to each link and clicks shortly after arriving, and the precog side has the
overlay open. Both sides are labelled by the control panel in the corner, so the clip needs no
captions.

Last run: the `off` arm waited 308, 301, 298, 300 and 844 ms for its five navigations; the
precog arm waited 91, 104, 92, 91 and 91 ms.

## Benchmark table

`pnpm bench` writes `bench/results/bench.md` and `bench.json`. The table in the README is that
file's output, unedited.

## Thread outline

1. **The problem.** Prefetching is a guess. `NuxtLink` guesses "everything you can see" and
   the browser guesses "whatever you hovered". Neither knows which link you actually want.
2. **The idea.** Ask a model. TypeSafe Jev answers typed questions in about 100 ms, so one
   request returns a probability for every link on the page.
3. **The wiring.** Three questions in one call: which link, how soon, will they leave. A policy
   turns those into at most three prefetches and one prerender, with budgets and guards. The
   API key stays on the server and the model can only answer with ids the server sent.
4. **What you see.** Percentages on every link, the top guess outlined, a HUD with calls,
   latency, tokens and hit rate. Shift+P.
5. **The numbers.** Median navigation 145 ms to 63 ms. p95 unchanged. 46 percent hit rate
   against a synthetic click model. Roughly three times the wasted bytes, about 7 kB to 19 kB
   per session. Around 15 Jev calls per session.
6. **The honest part.** Document speculation rules do nothing for a `NuxtLink` click; that is
   measured, not assumed. `eagerness: moderate` is free and ties this on visitors who hover for
   a while. The in-app win needs prerendered routes with payload extraction. The visitors in
   the benchmark are synthetic.
7. **Try it.** `npx nuxt module add nuxt-precog`, set `NUXT_PRECOG_API_KEY`, press Shift+P.

## Checklist

- [x] Side-by-side recording, reproducible with a script
- [x] Benchmark table, reproducible with a script
- [x] Thread outline
- [x] README with quickstart, options, privacy, limitations and the benchmark
- [x] `npx nuxt module add nuxt-precog` verified as a real command
- [ ] Publish, which needs an npm token in the repository secrets

# nuxt-precog

> Your links, loaded before the click.

A Nuxt module that asks [TypeSafe](https://typesafe.ai/) Jev which link a visitor is about to
click, then warms exactly that navigation with the
[Speculation Rules API](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API)
and Nuxt's own route preloading. It comes with an overlay that draws the probabilities on top
of the page, so you can watch it guess.

Not a general prefetcher. `NuxtLink` already prefetches every link that enters the viewport.
This one tries to prefetch three links instead of thirty, and to start before the hover.

**[Documentation](https://oskarlebuda.github.io/nuxt-precog)**

<!-- Record the hero clip yourself with `pnpm dev:build && pnpm record`. -->

## Quickstart

```sh
npx nuxt module add nuxt-precog
```

Set a key from [console.typesafe.ai](https://console.typesafe.ai/settings/keys):

```sh
# .env
NUXT_PRECOG_API_KEY="your-api-key"
```

That is the whole setup. The defaults prefetch at most three links and never prerender.
Run `nuxt dev`, open any page and press <kbd>Shift</kbd>+<kbd>P</kbd> to see what it is doing.
The overlay is development only unless you ask for it with `overlay: true`.

To let it prerender the top guess as well:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["nuxt-precog"],
  precog: {
    mode: "auto",
    takeOverNuxtLinkPrefetch: true,
  },
});
```

Read [the prerender warning](#prerendering-has-side-effects) before you do.

## What it actually buys you

Eight synthetic sessions per arm, six navigations each, real Chrome against a production
build, throttled to 250 ms latency and 2000 kbit/s. Full method and how to read it are in
[the benchmark page](https://oskarlebuda.github.io/nuxt-precog/guide/benchmarks); the raw
numbers are in [`bench/results/bench.md`](./bench/results/bench.md). Reproduce with `pnpm bench`.

| arm                 | off    | native | precog    |
| ------------------- | ------ | ------ | --------- |
| navigation median   | 145 ms | 142 ms | **63 ms** |
| navigation p95      | 403 ms | 403 ms | 389 ms    |
| hit rate            | n/a    | n/a    | 46%       |
| top guess correct   | n/a    | n/a    | 27%       |
| wasted kB / session | 6.9    | 6.9    | 18.6      |
| jev calls / session | 0      | 0      | 14.6      |

Read that honestly:

- The median navigation gets about twice as fast. **The p95 does not move.** The tail is the
  navigations the model got wrong, and no amount of prediction fixes those.
- It roughly triples wasted bytes, from about 7 kB to about 19 kB per session.
- It costs about 15 Jev calls per session, 18 percent of which the server answered from cache.
- `native` is document speculation rules at `eagerness: moderate`. It is free, needs no model
  and no key, and in this benchmark it ties `off`, because a visitor who clicks soon after the
  cursor lands does not give the browser enough hover to work with. That gap is what precog is
  for. If your visitors hover for a second before clicking, use `native` and save the money.
- `off` is not "nothing": `NuxtLink` still prefetches on interaction in every arm.
- The visitors are synthetic and their click model is a guess. Hit rate and accuracy describe
  how the module does against that model, not against your users.

## How it works

One request per prediction, three questions, evaluated in parallel:

| Key    | Type                                      | Asked                                                     |
| ------ | ----------------------------------------- | --------------------------------------------------------- |
| `next` | choice over the candidate ids plus `none` | Which of these links will the visitor click next, if any? |
| `soon` | score over four levels                    | How soon will the visitor open another page?              |
| `exit` | yes/no                                    | Will the visitor leave the site entirely instead?         |

```
collect links + signals  --POST-->  validate, rate limit, cache  --> Jev
                         <--------  [{ id, p }], soon, exit
policy (thresholds, budgets, guards)
  |-> <script type="speculationrules">   for document navigations
  |-> preloadPayload / preloadRouteComponents   for in-app navigations
```

The full walk-through is in [the documentation](https://oskarlebuda.github.io/nuxt-precog/guide/how-it-works). The short version
of the important part: **a `NuxtLink` click is not a document navigation**, so speculation
rules do nothing for it. That is measured in `e2e/spa-vs-document.spec.ts`. The in-app win
comes from preloading the payload of the pages the model picked, which only exists for
prerendered routes.

## Options

All of these live under `precog` in `nuxt.config.ts`.

| Option                      | Default                                                      | What it does                                                         |
| --------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `enabled`                   | `true`                                                       | Turn the whole module off without removing it.                       |
| `endpoint`                  | `'/_precog/predict'`                                         | Path of the Nitro route that talks to Jev.                           |
| `model`                     | `'jev-latest'`                                               | Jev model name.                                                      |
| `baseURL`                   | unset                                                        | TypeSafe base URL. Point it at a mock in tests.                      |
| `mode`                      | `'prefetch'`                                                 | `'prefetch'`, `'prerender'` or `'auto'`.                             |
| `thresholds.prefetch`       | `0.25`                                                       | Lowest click probability worth a prefetch.                           |
| `thresholds.prerender`      | `0.6`                                                        | Lowest click probability worth a prerender.                          |
| `budget.maxPrefetch`        | `3`                                                          | Most URLs prefetched at once.                                        |
| `budget.maxPrerender`       | `1`                                                          | Most URLs prerendered at once.                                       |
| `budget.maxCallsPerMinute`  | `20`                                                         | Enforced on the client and on the server.                            |
| `budget.maxCallsPerSession` | `200`                                                        | Hard stop for one visitor.                                           |
| `maxCandidates`             | `30`                                                         | Links sent per request. Capped at 254 by Jev's choice limit.         |
| `timeoutMs`                 | `800`                                                        | Client deadline for a prediction.                                    |
| `minIntervalMs`             | `1200`                                                       | Shortest gap between two predictions.                                |
| `fallback`                  | `'native'`                                                   | On failure: `'native'` document rules at `moderate`, or `'none'`.    |
| `include`                   | `[]`                                                         | Only these path globs may be speculated. Empty means all.            |
| `exclude`                   | `['/logout', '/signout', '/api/**', '/auth/**', '/cart/**']` | Never speculated.                                                    |
| `cache.ttlSeconds`          | `60`                                                         | How long a prediction stays reusable on the server.                  |
| `privacy.sendQuery`         | `false`                                                      | Send query strings. Off because they carry tokens.                   |
| `privacy.sendAnchorText`    | `true`                                                       | Send link text.                                                      |
| `privacy.sendHistory`       | `true`                                                       | Send the last five paths.                                            |
| `privacy.requireConsent`    | `false`                                                      | Nothing runs until `grantConsent()`.                                 |
| `overlay`                   | `'dev'`                                                      | `true`, `false` or `'dev'`. When false, nothing ships.               |
| `takeOverNuxtLinkPrefetch`  | `false`                                                      | Turn off `NuxtLink`'s viewport prefetch, keep interaction.           |
| `documentNavigation`        | `false`                                                      | Experimental. See below.                                             |
| `pricing`                   | unset                                                        | `{ inputPerMillion, outputPerMillion }` for the overlay's cost line. |

The API key is read from `runtimeConfig.precog.apiKey`, so `NUXT_PRECOG_API_KEY` sets it at run
time. `TYPESAFE_API_KEY` works too. It is never exposed to the browser.

### Per page and per link

```vue
<script setup>
definePageMeta({ precog: false }); // this page never predicts
</script>

<template>
  <NuxtLink to="/settings" data-precog="off">Never speculate this</NuxtLink>
  <NuxtLink to="/pricing" data-precog="hint">Always a candidate, even off screen</NuxtLink>
</template>
```

### Composable

```ts
const { enabled, pause, resume, refresh, grantConsent, metrics, plan } = usePrecog();
```

`pause()` stays paused until you call `resume()`; a navigation will not undo it.

### Hooks

```ts
// client
nuxtApp.hook("precog:decision", (plan, trigger) => {});
nuxtApp.hook("precog:metrics", (summary) => {});
```

```ts
// server, in a nitro plugin
nitroApp.hooks.hook("precog:predict", (ctx) => {
  // read ctx.state, or set ctx.prediction to answer without calling Jev
});
nitroApp.hooks.hook("precog:predicted", (ctx) => {
  // every fresh answer, for recording or logging
});
```

`precog:predict` is how the playground runs with no key at all, and how you would swap in your
own model.

## The overlay

In development, `?precog=debug` or <kbd>Shift</kbd>+<kbd>P</kbd> draws a percentage on every candidate,
outlines the top guess, and opens a HUD with calls, cache hits, Jev latency, tokens, hit rate
and activations. `?precog=off` disables the module for a side-by-side comparison.

There is also a DevTools tab with the same numbers and a timeline of decisions.

With `overlay: 'dev'` neither ships: the plugin is only registered when the overlay is on, so
a production build never sees the component. `pnpm check:treeshake` proves it.

## Browser support and limitations

- **Speculation rules are Chromium only.** Elsewhere, prefetch falls back to
  `<link rel="prefetch">` and prerender is skipped. Effector B works everywhere.
- **Chrome limits concurrent speculations** to 50 prefetches and 10 prerenders for
  `immediate` list rules. The default budgets are far below that.
- **Inline rules need CSP headroom.** Add `'inline-speculation-rules'` to `script-src` if you
  have a policy.
- **Payload preloading needs a payload**, which means prerendered routes with
  `experimental.payloadExtraction`. On a purely server-rendered route there is much less to
  warm and the win is small.
- **It costs money per prediction.** About 15 calls per session in the benchmark. Tune
  `minIntervalMs`, `cache.ttlSeconds` and the budgets before pointing it at real traffic.
- **Jev is in early access.** Every failure path returns an empty prediction and the page is
  untouched.

### Prerendering has side effects

A prerendered page runs its JavaScript. Analytics fire, `onMounted` fetches run, media can
autoplay. Gate anything like that:

```ts
if (document.prerendering) {
  document.addEventListener("prerenderingchange", start, { once: true });
} else {
  start();
}
```

This is why `mode` is `'prefetch'` by default, and why `maxPrerender` is 1.

### `documentNavigation`

Experimental. With it on, a click on a link the module prerendered bypasses the client router
and does a real document navigation, so the browser can hand over the copy it already has.
Good for content sites that want an MPA feel; it throws away the SPA's state on every click.
Measured behaviour and its limits are in
[the options reference](https://oskarlebuda.github.io/nuxt-precog/reference/options#documentnavigation).

## Privacy

The module sends page context and part of a browsing path to a third party. It sends no
identifier of any kind, no full URLs, and never the API key.
[The privacy page](https://oskarlebuda.github.io/nuxt-precog/guide/privacy) lists exactly what
goes over the wire, the switches that narrow it, and how to gate it behind consent.

## Development

```sh
pnpm install
pnpm dev              # playground at localhost:3003, runs without an API key
pnpm check            # lint, typecheck, unit tests
pnpm test:e2e         # builds the playground and drives real Chrome
pnpm bench            # writes bench/results/bench.md
pnpm record           # writes the side-by-side clip to bench/results, 60 fps
pnpm docs:dev         # the documentation site
pnpm client:dev       # the DevTools tab on its own, while working on it
```

`pnpm dev:prepare` builds the DevTools tab client into `dist/client`, which `pnpm dev` runs
first. To work on the tab itself, start `pnpm client:dev` and run the playground with
`PRECOG_DEVTOOLS_LOCAL=1`, which proxies the tab to that dev server instead.

The unit suite never touches the network: `test/mock-typesafe.ts` is a small stand-in for the
System One API, built from the wire format in
[advocaat](https://github.com/pithings/advocaat)'s client. The live smoke test is skipped
unless `TYPESAFE_API_KEY` is set.

## License

[MIT](./LICENSE)

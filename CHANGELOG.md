# Changelog

## v0.3.0

precog is no longer Nuxt only. The module was split into a framework-free core and one adapter
per framework, so the same prediction loop now runs on Next.js.

### Packages

- `precog-core` holds everything that never needed a framework: candidates, policy, speculation
  rules, and the prediction endpoint that talks to Jev.
- `nuxt-precog` is the Nuxt module, same name and same behaviour as before. Upgrading is the
  only thing an existing install has to do.
- `next-precog` is new, for the App Router.

### Next.js

`PrecogProvider` wires the client, `usePrecog()` exposes the same state as on Nuxt, and a route
handler covers the server half. Next has no global prefetch switch, so `PrecogLink` replaces
`next/link` where you want precog to decide instead of the viewport.

### Documentation

The site moved to <https://precog.oskarlebuda.dev>. A custom domain keeps documentation links
alive across renames, which the move from `nuxt-precog` to `precog` did not.

## v0.2.0

The first release built against the real Jev. Everything in 0.1.0 was developed and tested
against stand-ins, and the first real key found three things it could not have.

### Features

- Vercel AI Gateway keys. An `AI_GATEWAY_API_KEY` selects the gateway on its own, and a new
  `provider` option covers a gateway key passed through `NUXT_PRECOG_API_KEY`. Before this, a
  gateway key went to `api.typesafe.ai` and came back `401`.
- The overlay and the DevTools tab show why the last prediction failed, instead of only
  counting it. A wrong key, a timeout and a rejected request shape used to look identical.

### Changed behaviour

- `model` now defaults to unset rather than `jev-latest`. Through the gateway a bare name gets
  a `typesafe-ai/` prefix, so the old default asked for `typesafe-ai/jev-latest`, which does not
  exist. advocaat picks the right name for whichever service the key belongs to. Set it only if
  you know you need to.
- `timeoutMs` now defaults to 1500 rather than 800. Measured round trips are 372 ms at the
  median and 622 ms at the p95, with cold ones over 800, so the old default cut off the first
  prediction of a session.

### Confirmed against the real service

- Jev accepts the module's own option keys (`l0`, `l1`, ... and `none`) and answers with them,
  which is what keeps its output space to ids the server wrote itself.
- The benchmark now measures Jev rather than a heuristic. Median navigation 147 ms to 68 ms,
  p95 unchanged, 29 percent hit rate against a scripted visitor. The earlier published figures
  came from a stand-in that shared the visitor's own click model and flattered the module.

### Development

- The playground has no stand-in of its own and needs a key. The end-to-end suite starts a mock
  of the *service* instead, so it now covers the server route and advocaat's HTTP client too.

## v0.1.0

First release.

### Features

- Ask TypeSafe Jev which link a visitor is about to click, through a Nitro route that keeps the
  API key on the server.
- Two effectors: one `<script type="speculationrules">` for document navigations, and
  `preloadPayload` plus `preloadRouteComponents` for in-app navigations.
- A policy with thresholds, budgets and guards: same origin only, no `saveData`, no slow
  connections, no hidden tab, no denied paths, hysteresis on active speculations.
- Server side validation, per-IP rate limiting, a prediction cache in Nitro storage, and the
  `precog:predict` and `precog:predicted` hooks.
- `usePrecog()`, `definePageMeta({ precog: false })`, `data-precog="off"` and
  `data-precog="hint"`, and the `precog:decision` and `precog:metrics` client hooks.
- A probability overlay and HUD, which do not ship in a production build with the default
  `overlay: 'dev'`.
- A Nuxt DevTools tab with the metrics, the current plan, the ranking and controls that drive
  the module in the page.
- `takeOverNuxtLinkPrefetch` to replace `NuxtLink`'s blanket viewport prefetch.
- Experimental `documentNavigation`.
- A playground and a benchmark harness.
- Documentation at <https://precog.oskarlebuda.dev>.
- Published from GitHub Actions with npm trusted publishing, so there is no token anywhere.

### Known limits

- Speculation rules are Chromium only. Elsewhere prefetch falls back to
  `<link rel="prefetch">` and prerender is skipped.
- Payload preloading needs a payload, so the in-app win applies to prerendered routes.
- The benchmark improves the median navigation and does not move the p95. See the README.

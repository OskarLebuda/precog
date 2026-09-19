# Changelog

## v0.1.1

The first release against the real Jev. Everything in 0.1.0 was built and tested against
stand-ins, and the first real key found three things it could not have.

### Fixes

- Support Vercel AI Gateway keys. An `AI_GATEWAY_API_KEY` now selects the gateway on its own,
  and a new `provider` option covers a gateway key passed through `NUXT_PRECOG_API_KEY`. Before
  this, a gateway key went to `api.typesafe.ai` and came back `401`.
- `model` defaults to unset instead of `jev-latest`. Through the gateway a bare name gets a
  `typesafe-ai/` prefix, so the old default asked for `typesafe-ai/jev-latest`, which does not
  exist. advocaat now picks the right name for whichever service the key belongs to.
- `timeoutMs` defaults to 1500 instead of 800. Real round trips measure 338 to 501 ms, with
  cold ones over 800, so the old default cut off the first request of a session.

### Confirmed

- Jev accepts the module's own option keys (`l0`, `l1`, ... and `none`) and answers with them,
  which is what keeps the model's output space to ids the server wrote itself.

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
- Documentation at <https://oskarlebuda.github.io/nuxt-precog>.
- Published from GitHub Actions with npm trusted publishing, so there is no token anywhere.

### Known limits

- Speculation rules are Chromium only. Elsewhere prefetch falls back to
  `<link rel="prefetch">` and prerender is skipped.
- Payload preloading needs a payload, so the in-app win applies to prerendered routes.
- The benchmark improves the median navigation and does not move the p95. See the README.

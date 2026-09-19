# Changelog

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
- A playground that runs without an API key, and a benchmark harness.
- Documentation at <https://oskarlebuda.github.io/nuxt-precog>.
- Published from GitHub Actions with npm trusted publishing, so there is no token anywhere.

### Known limits

- Speculation rules are Chromium only. Elsewhere prefetch falls back to
  `<link rel="prefetch">` and prerender is skipped.
- Payload preloading needs a payload, so the in-app win applies to prerendered routes.
- The benchmark improves the median navigation and does not move the p95. See the README.

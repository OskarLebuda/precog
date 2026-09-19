# Decisions

> One entry per decision taken while building, kept especially where reality differed
> from the plan. Mostly useful if you are wondering why something is the way it is.

## `expects_no_vary_search` is a string, not a flag

The plan suggested treating it as a hint to switch on. The HTML standard defines it as a
string parseable as a `No-Vary-Search` header value, so the option takes that string and the
rule is only emitted when it is set.

## Speculation rule tags

Confirmed against developer.chrome.com: rules take a `tag`, reflected in the
`Sec-Speculation-Tags` request header. The module tags its own rules `precog` and the native
fallback `precog-native`, so a server can tell the two apart.

## Candidate ids are assigned after the cap

Jev only answers with the option keys it was given. Ids run `l0`, `l1`, ... with no gaps and
are assigned after sorting and capping, so the id set is always a dense prefix and the server
can check a returned id with one bounds test as well as a set lookup.

## Hysteresis on active speculations

Chrome cancels a prerender as soon as its URL leaves the rule set. A probability that wobbles
around the threshold would cancel and restart the same load. An active speculation therefore
keeps its slot while it stays above three quarters of its threshold.

## advocaat's client, not `ask()`, on the server

The plan called for `ask(state, questions, options)`. `ask()` drops the `usage` field that the
System One response carries, and the overlay needs token counts for its cost estimate. The
questions are still authored with advocaat's `choice`, `score` and `chance` tags, then spread
into plain question objects and sent through advocaat's `typesafe()` client, which returns
`{ model, answers, usage }`. The score ratio that `ask()` would compute is one division.

## Candidate ids must be the dense prefix

The server rejects a body whose candidate `id` is not exactly `l<index>`. That makes the
subset check on the way back a formality rather than the only line of defence: an id Jev
returns is either one the server itself wrote into the request, or it is dropped.

## Rate limiting runs before the cache

A cached answer is cheap but not free, and the limit is there to protect the endpoint as well
as the Jev bill. Calls are counted before the cache is consulted.

## Document speculation does nothing for a NuxtLink click (measured)

`e2e/spa-vs-document.spec.ts` records what Chrome actually fetches.

- With a `prefetch` list rule for `/blog/1`, Chrome fetches that document with
  `Sec-Purpose: prefetch`. That part works.
- Clicking the `NuxtLink` to `/blog/1` then makes **no document request at all**. The client
  router handles it, so the prefetched document is never used. The plan's constraint 5 is
  correct.
- Setting `location.href` to the same URL does use it: the new document reports
  `deliveryType: "navigational-prefetch"`.

Two consequences:

1. Effector A (speculation rules) pays off for full document navigations: the first landing
   on a site, links opened in a new tab, and the experimental `documentNavigation` mode.
2. For ordinary in-app navigation the win has to come from effector B, and from _narrowing_
   what is loaded rather than adding to it. `NuxtLink` prefetches every link that enters the
   viewport; precog's job there is to prefetch three instead of thirty.

A second measurement: in the playground, a `NuxtLink` click fetches nothing at all, because
`NuxtLink` had already prefetched the route chunk and the pages have no server data. So the
benchmark in M7 has to measure pages that do fetch data, or the numbers mean nothing.

## Playwright runs against installed Chrome

The bundled Chromium build could not be downloaded in this environment, and Speculation Rules
are a Chromium feature anyway. The e2e project uses `channel: "chrome"`, which also means the
tests exercise the shipping implementation rather than a build ahead of it.

## Effector B warms payloads, and that is where the SPA win comes from

Measured in `e2e/navigation-time.spec.ts`, on a link throttled to 400 ms of latency and
750 kbit/s: navigating to a prerendered docs page takes about 860 ms cold and about 70 ms when
precog warmed it. The saving is the payload round trip, not the route chunk.

This only applies to routes that have a payload, which means prerendered routes with
`experimental.payloadExtraction`. On a purely server-rendered route there is no payload to
warm, and `preloadRouteComponents` alone saves very little, because the chunk is small and
often already loaded. The README says this plainly rather than implying every site gets 10x.

## `takeOverNuxtLinkPrefetch` keeps prefetch on interaction

`NuxtLink` prefetches every link that enters the viewport. Turning it off wholesale would make
precog strictly worse whenever the model is wrong. The option therefore sets
`prefetchOn: { visibility: false, interaction: true }`: precog handles the ahead-of-hover case,
and a hover on any link still warms it as a safety net.

## The cost line says "no prices configured" by default

TypeSafe does not publish prices anywhere the docs link to, so the module has no honest
default to multiply tokens by. The HUD shows token counts always and a dollar figure only when
`precog.pricing` is set, labelled as an estimate.

## The DevTools tab talks over a BroadcastChannel

A custom DevTools tab renders in its own iframe, so it cannot read the page's state directly.
The overlay plugin posts every decision and metrics update to a `BroadcastChannel("precog")`
and the tab listens. That keeps the orchestrator free of DevTools code, and the tab is a
single static HTML page served by a handler that only exists in development.

## `pause()` is not undone by a navigation

The router used to resume the module whenever it entered a page that had not opted out, which
silently reversed a `usePrecog().pause()`. Page opt-out is now tracked separately from the
application's own pause, so each only undoes itself. The playground's demo arms rely on this:
they call `pause()` once and it stays paused across navigations.

## The overlay clears when the page changes

The plan names links on the page that was just left. Keeping it around after a navigation drew
badges over unrelated paragraphs. The orchestrator now announces an empty plan on every route
change, and the overlay empties with it.

## Prerendering in the playground is scoped by hand

`nitro.prerender.crawlLinks` followed the header links and turned the whole demo into static
files, which meant the artificial latency middleware never ran and there was nothing to make
faster. Crawling is off and the docs routes are listed explicitly.

## `documentNavigation` gets a prefetch, not always a prerender

Measured in `e2e/demo.spec.ts`: with the flag on, a click leaves the router out and the browser
fetches the document itself, reporting `deliveryType: "navigational-prefetch"`. Chrome had not
finished a prerender in the seconds the test allows, so the flag's promise is "a real document
navigation that uses whatever the browser already has", not "always instant".

## The benchmark's `off` arm is not "nothing"

The playground turns on `takeOverNuxtLinkPrefetch`, which leaves `NuxtLink` prefetching on
interaction in every arm. So `off` means "Chrome and Nuxt on their own", a much stronger
baseline than a site with no prefetching at all. It is also the baseline worth beating, so the
benchmark keeps it and says so in the table.

## What the benchmark actually shows

Median navigation drops from about 145 ms to about 63 ms, and p95 does not move at all
(403 ms against 389 ms). Precog helps the common case and does nothing for the tail, which is
what you would expect: the tail is the navigations the model got wrong. It roughly doubles
speculative waste, from about 7 kB to about 19 kB per session, and costs around 15 Jev calls
per session with 18 percent of those answered from the server cache. None of that is hidden.

## Runtime imports carry no file extension

Building the module and installing the tarball into a fresh Nuxt app failed twice, in two
different ways, both caused by `.ts` extensions:

1. `createResolver().resolve("./runtime/plugin.client.ts")` pointed at a file that only exists
   in the source tree; the build ships `plugin.client.js`.
2. Relative imports inside the runtime kept their `.ts` specifiers, which the build does not
   rewrite, so the shipped `plugin.client.js` imported `./core/orchestrator.ts`.

Every relative import under `src/` is now extensionless, and the fresh-app check is part of the
release routine rather than something to remember.

## `vue-tsc` is required to build

The overlay is a single-file component, and `@nuxt/module-builder` needs `vue-tsc` to emit its
declarations. Without it the build fails with an unhelpful `Cannot read properties of
undefined (reading 'errors')`.

## The DevTools tab is a real tab, not a served HTML page

The first version served a hand-written HTML page from a Nitro route and fed it over a
`BroadcastChannel`. That is not how DevTools integrations are meant to work. The tab is now
built the way the Module Authors guide describes: a small Nuxt app under `client/`, generated
into `dist/client`, served with `sirv` from the host's dev server, and registered with
`addCustomTab`. During local work on the tab itself, `pnpm client:dev` serves it on port 3300
and the host proxies to it.

`@nuxt/devtools-ui-kit` is **not** used: its own documentation marks it deprecated and tells
new integrations not to build against it. The tab uses plain CSS with `color-scheme: light dark`.

The client reads the module straight off the host page through
`useDevtoolsClient().host.nuxt`, so the `BroadcastChannel` is gone and the tab can also drive
the module: pause, resume, predict now, reset counters.

Two things this cost, both worth knowing:

- A DevTools custom tab is registered under "modules" but is **not** pinned to the sidebar. It
  is reachable at `/__nuxt_devtools__/client/modules/custom-<name>` and listed in DevTools
  settings. The e2e suite navigates there rather than hunting for a sidebar button.
- DevTools refuses most features to an "untrusted browser". The playground sets
  `devtools.disableAuthorization` when `PRECOG_DEVTOOLS_OPEN=1`, which is how Playwright drives
  it.

## The e2e suite runs two servers

Speculation rules and preloading are tested against the production build; DevTools only exists
in a dev server. Playwright therefore starts both, and the `devtools` project points at the dev
one. `pnpm test:e2e` builds the module and the tab client first, because without `dist/client`
the tab falls back to proxying a dev server that is not running.

## Publishing uses OIDC, not a token

Releases run `npm publish` from GitHub Actions with `id-token: write` and no npm token at all.
npm verifies the OIDC token against a trusted publisher configured on the package, and attaches
provenance itself, so `publishConfig.provenance` is gone as well.

`pnpm publish` also speaks OIDC, but only from pnpm 11.1.3 onwards, and this repository is
pinned to pnpm 10 through `packageManager`. The publish step therefore uses npm, which is the
path npm documents, with `--ignore-scripts` because the build already ran.

`devEngines.packageManager` had to go: it made npm refuse to run **anything** in this
repository, including `npm publish` and `npx nuxt build`. `packageManager` states the same
intent without blocking other tools, and `pnpm/action-setup` reads it.

One thing this cannot do is create the package. A trusted publisher is configured on a package
that already exists, so the first version of a new name has to be published once by a human.

## A listener that throws does not cost a prediction

`precog:predicted` only observes, so a listener that throws now leaves the answer alone. Before
this, the playground's own recorder threw `EROFS` on a bad path in a bundled build and turned
every good prediction into a 503, silently. A `precog:predict` listener that throws still fails
the request, because that hook is allowed to _replace_ the answer and there is no safe way to
tell a refusal from a bug.

The same bug also hid itself: the catch around the Jev call swallowed everything. Failures now
come back in `x-precog-reason`, truncated and with no request body or key in them.

## The DevTools tab has to be found in two places

`pnpm dev` loads the module as a jiti stub, so `import.meta.url` points at `src/` and
`resolver.resolve("./client")` resolves to `src/client`, which does not exist. The tab fell
through to proxying port 3300, nothing was listening, and the result was a blank tab with
`ECONNREFUSED` in the terminal and no explanation.

Three changes, because one was not enough:

1. The client is looked up in both layouts: `./client` next to `dist/module.mjs` for a
   published package, and `../dist/client` for the stub.
2. `dev:prepare` builds the client, after the stub build, which wipes `dist/`.
3. When the client genuinely is not there, the module says so instead of proxying silently.
   `PRECOG_DEVTOOLS_LOCAL=1` asks for the proxy on purpose, which is what `pnpm client:dev` is
   for.

The gap that let this ship was in the testing, not the code: the DevTools e2e ran against a
real `nuxt-module-build build`, never against the stub that `pnpm dev` produces. `pnpm test:e2e`
now ends with `dev:prepare`, so those tests run in the configuration a developer actually gets,
and one of them asserts the client is served rather than proxied.

## The docs site is one flat guide

The site had a "Reference" section holding options, the API, this log and the release notes.
It was more structure than six pages need, and it split the options table away from the guide
that explains why you would change anything in it. Everything that documents the module is now
one `Guide` section; this log and the release notes moved to `.github/`, because they are notes
for whoever works on the repository, not documentation for whoever uses it.

The README lost its copy of the options table and the API reference for the same reason: it
was a second place to keep them in sync, and it always lost.

## `themeColor` takes a palette name, not a hex

undocs passes `themeColor` straight to Nuxt UI as `ui.colors.primary`, which expects a palette
name. `#00DC82` is accepted by the schema and silently produces no palette at all: the hero
button rendered invisible and every accent went grey. `emerald` (`#00d492`) is the palette
closest to Nuxt green, so that is what the site uses. The og-image handler does take a hex,
which is why the value looked like it worked.

## Mermaid on the site, ASCII in the README

undocs ships mermaid and turns a ` ```mermaid ` fence into its `<Mermaid>` component, so
"How it works" uses a sequence diagram: the round trip to Jev is the thing worth showing, and a
sequence diagram lays it out far better than the flowchart it replaced.

It is themed from inside the diagram, because undocs renders mermaid with its defaults and does
not follow the colour mode. The default theme put a pale yellow box on a near-black page. The
diagram sets `theme: base` with transparent fills, `#6b7280` for strokes and text, which is
legible on both white and near-black, and Nuxt emerald on the note borders. Checked in both
modes rather than assumed.

The README keeps its ASCII diagram on purpose: it is also the npm page, and npm does not render
mermaid.

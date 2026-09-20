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

Measured against Jev itself: median navigation drops from about 147 ms to about 68 ms, and p95
does not move (404 ms against 395 ms). Precog helps the common case and does nothing for the
tail, which is what you would expect, because the tail is the navigations the model got wrong.
It adds roughly 3 kB of speculative waste per session, costs about 15 calls and 10,000 tokens,
and the server cache answers a sixth of them.

The first version of this table was produced against a heuristic standing in for the model, and
it flattered the module: 46 percent hit rate instead of 29, and 27 percent top-guess accuracy
instead of 17. The stand-in scored candidates by position and visibility, which is exactly how
the scripted visitor picks a link, so it was in effect being graded on its own answer sheet.
That is a good argument for never benchmarking against a mock of the thing under test.

Wasted bytes went the other way, 18.6 kB down to 10.3. Jev concentrates probability far more
than the heuristic did, so fewer links clear the threshold.

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

## `devEngines.packageManager` had to go

It made npm refuse to run **anything** in this repository, including `npm pack` and
`npx nuxt build playground`. `packageManager` states the same intent without blocking other
tools, and `pnpm/action-setup` reads it.

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

## Mermaid for the flow, themed differently in each place

undocs ships mermaid and turns a ` ```mermaid ` fence into its `<Mermaid>` component, and
GitHub renders the same fence natively. Both the README and "How it works" use a sequence
diagram: the round trip to Jev is the thing worth showing, and a sequence diagram lays it out
far better than the flowchart it replaced.

The two are themed differently on purpose:

- **The docs site** sets `theme: base` inside the diagram, because undocs renders mermaid with
  its defaults and does not follow the colour mode, which put a pale yellow box on a near-black
  page. Transparent fills, `#6b7280` for strokes and text (legible on white and on near-black),
  Nuxt emerald on the note borders. Checked in both modes rather than assumed.
- **The README** carries no config at all, because GitHub themes mermaid to match the reader's
  own light or dark setting, and a hard-coded palette would override that.

One cost worth knowing: npm does not render mermaid, so on the package page that block shows as
its source. The diagram is short enough to still read as text.

## Every build in this repo needs a Nuxt prepare first

The root `tsconfig.json` extends `.nuxt/tsconfig.json`, which is generated. That is the Nuxt
module convention, but it means a clean checkout has a `tsconfig.json` that does not resolve,
and anything walking up the tree to find one falls over.

It bit two CI jobs and not the third: the `ci` job ran `pnpm dev:prepare` first, so it passed,
while `e2e` and `docs` did not and both failed with `Tsconfig not found`. The docs build was an
innocent victim: undocs loads its own app from this repo's `node_modules`, so resolving a
tsconfig for those files walks up to the repo root. Giving `docs/` its own `tsconfig.json` does
not help for that reason.

`test:e2e` now starts with `nuxt-module-build prepare`, so the script works from a clean
checkout anywhere, and the docs workflow runs the same prepare before building.

## The playground's shared module needs the `#shared` alias

Two playground pages imported `../../shared/docs`. That happens to work once `playground/.nuxt`
exists and fails on a genuinely clean build with a mangled relative path
(`../../../../../../../../playground/shared/docs.ts`), because `shared/` is a Nuxt directory
convention and is resolved through the `#shared` alias, not relatively. The bug had been there
the whole time and was invisible locally, because `playground/.nuxt` was never deleted.

## The docs site is deployed under a path prefix (superseded by the custom domain below)

GitHub Pages serves this repository at `oskarlebuda.github.io/precog/`, not at a domain
root. undocs builds asset paths from `/`, so the first deploy returned a perfectly valid
`index.html` whose every asset 404ed: a blank page.

`NUXT_APP_BASE_URL=/nuxt-precog/` fixes the bundled assets. It does not fix undocs' logo and
favicon, which are hardcoded as `/icon.svg` in its app config and end up both in the
prerendered HTML and in the client bundle. `scripts/fix-docs-base.mjs` rewrites those after the
build, matching only the fully quoted forms so a longer path is never caught by accident.

The base path lives in the workflow rather than in `docs:build`, because it is a property of
where the site is deployed, not of the site. A local `pnpm docs:build` still produces a
root-based build, which is what you want when previewing it.

What let this through: the deploy was checked with `curl`, which returned 200 and the right
`<title>`. The HTML was never the problem. A page is not verified until something renders it.

## What the first real call to Jev changed

Everything up to 0.1.0 was built and tested against stand-ins: a local HTTP server written from
advocaat's client source, and a heuristic in the playground answering the `precog:predict` hook.
The live smoke test was skipped on every single run. The first real key found four things.

**The question schema is fine.** Jev accepts `l0`, `l1`, `none` as option keys and answers with
them, which was an open question in the plan and is the whole containment story. With the cursor
on a link it gave that link `0.83` and the other `0.01`.

**A Vercel AI Gateway key is not a TypeSafe key.** Sent to `api.typesafe.ai` it answers
`401 Cannot authenticate with the server`, which reads like a bad key rather than the wrong
service. The module had no gateway support at all. It now resolves the provider from which
variable the key arrived in, and takes a `provider` option for when it arrives through
`NUXT_PRECOG_API_KEY`.

**`model: "jev-latest"` breaks the gateway.** advocaat prefixes a bare name with `typesafe-ai/`,
so the default asked for `typesafe-ai/jev-latest`, which does not exist. Measured:

```
default (no model)       OK,  model=typesafe-ai/jev
model: "jev-latest"      FAILED 404 Model 'typesafe-ai/jev-latest' not found
model: "typesafe-ai/jev" OK
```

The option now defaults to unset and advocaat picks per provider.

**The 800 ms timeout was too tight.** Real round trips measure 338 to 501 ms, with a cold one at
804 ms, against a plan that assumed 70 to 500. The first real request through the module timed
out at exactly 800 ms. The default is now 1500 ms. Candidate count barely moves latency (3 and
30 candidates land in the same range) but does move tokens, 1051 against 3459.

## The playground has no stand-in of its own

It used to answer the `precog:predict` hook with a heuristic, so `pnpm dev` worked with no key.
That was convenient and dishonest: the demo, the overlay numbers and the whole end-to-end suite
never touched the server route's call to Jev, and the HUD showed a latency the stand-in made up.

The heuristic moved into `test/mock-typesafe.ts`, which is a mock of the _service_, not of the
module. The playground now always takes the real path, and the end-to-end suite starts that
mock and points the playground at it with `TYPESAFE_BASE_URL`. Same cost, no key, and the
coverage now includes the route and advocaat's HTTP client.

`pnpm dev` and `pnpm bench` need a key. For the benchmark that is the point: it is supposed to
measure the real service.

Two things the move surfaced, both from ranking by label instead of by document order: `l10`
sorted ahead of `l2`, and the mock's `exit` probability was high enough to push the top
candidate just under the prerender threshold. Ties now keep document order, and `exit` drops
when the cursor is on a link, because someone hovering a link is not about to leave.

## A failure has to say why, in the overlay

The server has reported a reason in `x-precog-reason` since the hook bug, but the client threw
it away and the HUD showed only a counter. "1 failed" is indistinguishable between a wrong key,
a timeout and a rejected request shape, and every one of those has a different fix.

The client now reads that header, the orchestrator keeps the newest reason as
`metrics.lastError`, and both the overlay and the DevTools tab print it. A successful call
clears it.

This surfaced from a real report of "the playground keeps failing" that took a reproduction and
a header dump to diagnose, when the answer was sitting one response header away.

## Nuxt does not override an exported variable with `.env`

Chasing that report cost a detour: a stale `AI_GATEWAY_API_KEY` exported in the shell shadowed
the current one in `playground/.env`, because dotenv leaves existing environment variables
alone. The symptom is a 401 with a key that demonstrably works when read from the file.

## One workspace, three packages

`precog-core` holds everything that never knew which framework it was in: candidates, signals,
the policy, the speculation rules, the telemetry, the orchestrator, and the prediction endpoint
minus its HTTP wrapper. That was 1933 lines already free of Nuxt, Vue and h3 imports, because
the orchestrator was written with its dependencies injected. Splitting it was moving files, not
rewriting them.

`precog-nuxt` and `precog-next` are what is left: a Nuxt module and a Next route handler plus
provider. Each is a few hundred lines.

One leak had to be plugged on the way: `takeOverNuxtLinkPrefetch` sat in the shared options
type, so `precog-core` knew about `NuxtLink` and `precog-next` had to carry a field it can
never use. It is a build-time Nuxt option and now lives only there.

## `"use client"` does not survive bundling

The bundler dropped the directive from `precog-next`'s client entry, and nothing failed. Next
would have treated `PrecogProvider` as a server component and thrown on the first hook, in
every app that installed it.

`packages/next/scripts/use-client.mjs` puts it back and then asserts the result, rather than
trusting the write. It also asserts that `dist/server.mjs` is _not_ marked, because the route
handler must stay out of the client graph. The chunk they share holds plain data with no hooks,
so it is safe in both.

That is the third time packaging broke silently in this project, after the `.ts` extensions and
the missing `dist/client`. Every one of them was caught by running the built artefact rather
than reading it.

## Next prefetches everything, and has no switch for it

Nuxt has `experimental.defaults.nuxtLink.prefetchOn`, which is how `takeOverNuxtLinkPrefetch`
hands the decision to precog. Next has no equivalent: `prefetch` is a prop on each `<Link>`.

So `precog-next` exports `PrecogLink`, which is `next/link` with `prefetch={false}`. Swapping
the import is the one manual step, and without it precog has nothing to narrow: the e2e suite
asserts that a docs page with twelve links warms at most four routes, and that assertion only
passes because the playground uses `PrecogLink`.

## The docs palette needs two different values

undocs derives the whole Nuxt UI palette from one `themeColor`, and that value is used twice
in ways that want opposite things:

- Nuxt UI wants a **palette name**. A hex leaves `primary` with no palette, and the hero button
  renders black on black.
- The og-image generator drops it straight into a CSS gradient, so it wants a **colour**. A
  palette name does not just degrade the image, it fails the build with
  `invalid value for backgroundImage ... near "neutral"`.

Black and white needs a neutral palette, which is in neither of their maps, so one value cannot
satisfy both. `themeColor` stays a hex for the og image, and `docs/.docs/app.config.ts` sets
`ui.colors.primary` to `neutral`. `.docs` is a Nuxt layer, so its app config wins over the one
undocs writes into its own nuxt.config.

Both `.gitignore` files had to stop ignoring that one file: `.docs` is a build directory that
now also holds two sources.

## The docs workflow kept a step that outlived its reason

`pnpm exec nuxt-module-build prepare` was added to the docs job because the root `tsconfig.json`
extended a generated file and undocs resolved it while building. The workspace split deleted
that root tsconfig, and moved `src/` into `packages/nuxt`, so the step could no longer find a
module and failed the whole job on the first push to main after the merge. The docs build needs
no prepare now.

## A custom domain removes the path prefix, and the rename made it necessary

Renaming the repository to `precog` broke every published link: GitHub does not redirect a
Pages URL after a rename, so `oskarlebuda.github.io/nuxt-precog` is a permanent 404, including
in the posts that announced the project. A custom domain makes the docs URL independent of the
repository name, so the next rename costs nothing.

`precog.oskarlebuda.dev` is a `CNAME` to `oskarlebuda.github.io` in Cloudflare, set to DNS only.
Proxying it would stop GitHub validating the domain, and the certificate would never be issued.

Serving from a domain root means `NUXT_APP_BASE_URL` and `scripts/fix-docs-base.mjs` both go:
undocs' `/icon.svg` is correct again with no rewriting, which is why the script existed at all.

`docs/.docs/public/CNAME` ends up in the built output on purpose. With `build_type: workflow`
the custom domain is stored in the repository settings, but a deploy whose artifact has no
`CNAME` can clear it, which silently takes the site off the domain.

## Publishing a workspace is not publishing a package

The release workflow was written for the flat layout and survived the workspace split unnoticed,
because nothing had been tagged since. It read the version from the root `package.json` and ran
`npm publish` there. The root is `private: true` and is not one of the four published packages,
so a tag would have published nothing at all.

Two traps sit under the rewrite:

`npm publish` ships `workspace:*` verbatim. The adapters depend on `precog-core` that way, so
publishing with npm produces a tarball whose dependency range no registry can resolve. `pnpm
pack` rewrites it to the real version, which is why the workflow packs with pnpm and hands the
tarball to `npm publish` rather than publishing the directory. Verified by unpacking the
tarball and reading its manifest, not by trusting either tool.

`precog-core` had no `publishConfig.access`. That mattered while the packages were scoped, and
is only belt and braces now that they are not.

## Trusted publishing was never actually working

The v0.2.0 tag failed with `404 Not Found - PUT https://registry.npmjs.org/nuxt-precog`, which
reads like a missing package but is how the registry reports an unauthorised publish. 0.2.0 went
out by hand, and the workflow kept looking correct because nothing retried it.

npm will not attach a trusted publisher to a package that does not exist yet, so the three
scoped packages cannot be covered before their first publish. That first publish is manual; the
tag-driven workflow only takes over from the second one.

## The `@precog` scope belongs to somebody else

The workspace was built and documented as `@precog/core`, `@precog/nuxt` and `@precog/next`
without ever checking that the scope could be published to. It cannot: the npm organisation
`precog` exists, has one owner, and that owner is a different account. Every publish returned
`404 Not Found - PUT`, which is how the registry reports an unauthorised write rather than a
missing package, so it read like a credential problem for three rounds of debugging: a stale
granular token, then a web login, then a security key prompt that succeeded and still 404ed.

`npm org ls precog` prints `{"precog": "owner"}`. That is a map of member to role, not a
statement about the caller, and misreading it as "you are the owner" cost a round on its own.
The reliable check is `registry.npmjs.org/<name>` returning 404 for a free name; the
`npmjs.com/org/<name>` page answers 403 for everyone not signed in, including for names that do
not exist, so it measures nothing.

The packages are now unscoped: `precog-core`, `precog-nuxt`, `precog-next`, alongside the
existing `nuxt-precog` stub. All four names were verified free against the registry before the
rename, which is the check that should have happened first.

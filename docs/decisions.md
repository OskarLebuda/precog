# Decisions

One short entry per decision taken while building, especially where reality differed from
the plan.

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

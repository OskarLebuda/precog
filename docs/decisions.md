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

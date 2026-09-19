# nuxt-precog

> Your links, loaded before the click.

A Nuxt module that asks TypeSafe Jev which link a visitor is about to click, then warms
exactly that navigation with the Speculation Rules API and Nuxt's own preloading.

## Rules

- Keep it small, minimal and fast. No backward compatibility is needed yet.
- Fail open. Any error, timeout or missing key means "do nothing", never a broken page.
- The API key never reaches the browser. Every Jev call goes through the Nitro route.
- Jev only ever answers with candidate ids the server sent. The server checks that the
  returned ids are a subset of the request's ids before mapping them back to paths.
- Use simple English. Hyphens, never em dashes, in docs, comments and commit messages.
- Short comments only for what the code cannot say itself. No history, no restating code.
- Small conventional commits.
- Keep this file current.

## Layout

- `src/module.ts`: options, defaults, run-time config, wiring.
- `src/runtime/types.ts`: shared types for client, server and public API.
- `src/runtime/core/*`: pure logic (candidates, signals, state, policy, rules), unit tested.
- `src/runtime/server/*`: the Nitro route that talks to Jev through advocaat.
- `playground/`: demo site used for the recording and for e2e.
- `bench/`: synthetic-visitor benchmark harness.
- `docs/decisions.md`: one short entry per decision taken against the plan.

## Status

- M0 scaffold: module registered, options and run-time config in place, no-op client plugin.
- M1 core: `match`, `candidates`, `state`, `policy`, `rules` are pure and fully unit tested.
- M2 server: `POST {endpoint}` validates the body, rate limits per IP, caches in Nitro storage,
  runs the `precog:predict` hook, then calls Jev through advocaat's `typesafe()` client. Any
  failure is a 503 with an empty prediction. `test/mock-typesafe.ts` stands in for the real API
  so the suite runs offline; the live smoke test is skipped without `TYPESAFE_API_KEY`.

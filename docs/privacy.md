# Privacy

The module sends page context and part of a visitor's browsing path to a third party
(TypeSafe) on a schedule you control. Read this before turning it on for real traffic.

## What leaves your server

Exactly this, and nothing else:

```jsonc
{
  "page": { "path": "/docs", "title": "Docs", "h1": "Docs", "description": "..." },
  "session": {
    "previousPaths": ["/", "/blog"], // last five, paths only
    "timeOnPageMs": 4200,
    "scrollDepth": 0.45, // 0 to 1
    "scrollVelocity": 1.2, // viewport heights per second
  },
  "pointer": {
    "hasHover": true,
    "x": 5,
    "y": 7, // tenths of the viewport, not pixels
    "vx": 1.2,
    "vy": -0.4,
    "nearestIds": ["l2", "l0", "l5"],
    "hoveredId": "l2",
  },
  "device": { "saveData": false, "effectiveType": "4g" },
  "candidates": [
    {
      "id": "l0",
      "path": "/docs/options",
      "text": "Options",
      "inViewport": true,
      "position": { "x": 2, "y": 3 },
    },
  ],
}
```

## What does not

- **The API key.** It lives in `runtimeConfig.precog.apiKey`, which is server only. There is an
  e2e test that starts the server with a known key and fails if that string appears in any
  document or bundle the browser receives.
- **Full URLs.** Only rooted paths, and query strings only when `privacy.sendQuery` is on.
- **Any identifier.** No cookie, no user id, no device id, no fingerprint. Nothing ties two
  sessions together, and the module stores nothing beyond a counter in `sessionStorage`.
- **Page content.** Only the title, the first `h1`, the meta description, and the text of the
  candidate links.

## Switches

```ts
precog: {
  privacy: {
    sendQuery: false,       // query strings, off by default because they carry tokens
    sendAnchorText: true,   // link text; turn off and Jev sees paths only
    sendHistory: true,      // the last five paths
    requireConsent: false,  // nothing runs until usePrecog().grantConsent()
  },
  exclude: ['/logout', '/signout', '/api/**', '/auth/**', '/cart/**'],
}
```

With a consent banner:

```ts
const { grantConsent } = usePrecog();

function onAccept() {
  grantConsent();
}
```

With `requireConsent: true` the client collects nothing, sends nothing and writes no rules
until `grantConsent()` is called. It is not a delay; it is a hard stop.

## Untrusted link text

Anchor text is page content, and on many sites page content comes from users. It is sent as
the description of a choice option, so the worst it can do is argue for its own option. Three
things keep that contained:

1. The server strips backticks and newlines and truncates to 80 characters.
2. The model can only answer with ids the server put in the request.
3. The server drops any id that was not in its own request, and the ids must be the exact
   dense sequence `l0`, `l1`, ... A test covers this.

## Prediction responses are never shared

The endpoint sends `Cache-Control: no-store`. The server-side cache is keyed on the page and
its link set plus coarse signal buckets, never on anything identifying, and it holds only
`{ id, probability }` pairs.

## Speculative loads reach your own server

A prefetch or prerender is a real request for a real page, with the visitor's cookies, carrying
`Sec-Purpose: prefetch` (or `prefetch;prerender`). Two consequences:

- Analytics will see page views that never happened. Gate them on `document.prerendering` and
  the `prerenderingchange` event.
- Anything with a side effect on `GET` must be on `exclude`. The defaults cover the usual
  suspects; your own are your own.

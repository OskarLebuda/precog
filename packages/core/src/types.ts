/** Shared types for the client plugin, the server handler and the public API. */

/** Which speculative loads the policy is allowed to plan. */
export type PrecogMode = "prefetch" | "prerender" | "auto";

/** What to do when a prediction fails or times out. */
export type PrecogFallback = "native" | "none";

/** When to mount the debug overlay. */
export type PrecogOverlay = boolean | "dev";

export interface PrecogThresholds {
  /** Minimum click probability for a prefetch. */
  prefetch: number;
  /** Minimum click probability for a prerender. */
  prerender: number;
}

export interface PrecogBudget {
  /** Most URLs prefetched at once. */
  maxPrefetch: number;
  /** Most URLs prerendered at once. */
  maxPrerender: number;
  /** Most prediction calls per rolling minute, per client and per server. */
  maxCallsPerMinute: number;
  /** Most prediction calls for the whole session. */
  maxCallsPerSession: number;
}

export interface PrecogPrivacy {
  /** Send the query string of the current page and of candidate links. */
  sendQuery: boolean;
  /** Send the visible text of candidate links. */
  sendAnchorText: boolean;
  /** Send the last few paths the visitor came from. */
  sendHistory: boolean;
  /** Do nothing until `usePrecog().grantConsent()` is called. */
  requireConsent: boolean;
}

export interface PrecogCacheOptions {
  /** How long a prediction stays reusable on the server. */
  ttlSeconds: number;
}

/** Options the client plugin and the server handler both read. */
export interface PrecogPublicOptions {
  enabled: boolean;
  endpoint: string;
  mode: PrecogMode;
  thresholds: PrecogThresholds;
  budget: PrecogBudget;
  maxCandidates: number;
  timeoutMs: number;
  minIntervalMs: number;
  fallback: PrecogFallback;
  include: string[];
  exclude: string[];
  privacy: PrecogPrivacy;
  overlay: boolean;
  takeOverNuxtLinkPrefetch: boolean;
  documentNavigation: boolean;
  /** Prices for the overlay's cost estimate, in dollars per million tokens. */
  pricing?: { inputPerMillion: number; outputPerMillion: number };
}

// --- prediction wire shapes ---

/** A link as it is sent to the server. Never carries a full URL or an element. */
export interface PrecogCandidate {
  /** Opaque id, `l0`, `l1`, and so on. The model only ever answers with these. */
  id: string;
  /** Same-origin path, query stripped unless `privacy.sendQuery`. */
  path: string;
  /** Link text, empty when `privacy.sendAnchorText` is off. */
  text: string;
  /** Whether the link is inside the viewport right now. */
  inViewport: boolean;
  /** Viewport position of the link centre, in coarse tenths of the viewport. */
  position: { x: number; y: number };
  /** True when the link carries `data-precog="hint"`. */
  hint?: boolean;
}

/** A candidate plus the client-only fields the effectors need. Never sent to the server. */
export interface PrecogLink extends PrecogCandidate {
  /** Absolute same-origin URL to speculate. */
  href: string;
  /** True for `target="_blank"`, which may be prefetched but never prerendered. */
  blank: boolean;
}

export interface PrecogPageContext {
  path: string;
  title: string;
  h1: string;
  description: string;
}

export interface PrecogSessionContext {
  /** Up to five earlier paths, oldest first. Empty when `privacy.sendHistory` is off. */
  previousPaths: string[];
  timeOnPageMs: number;
  /** How far down the page the visitor has read, 0 to 1. */
  scrollDepth: number;
  /** Recent scroll speed in viewport heights per second, signed. */
  scrollVelocity: number;
}

export interface PrecogPointerContext {
  hasHover: boolean;
  /** Pointer position in tenths of the viewport. */
  x: number;
  y: number;
  /** Pointer velocity in tenths of the viewport per second. */
  vx: number;
  vy: number;
  /** Up to three candidate ids the pointer is heading towards, nearest first. */
  nearestIds: string[];
  /** The candidate the pointer is over, if any. */
  hoveredId: string | null;
}

export interface PrecogDeviceContext {
  saveData: boolean;
  effectiveType: string;
}

/** The whole state sent to Jev in one request. */
export interface PrecogState {
  page: PrecogPageContext;
  session: PrecogSessionContext;
  pointer: PrecogPointerContext;
  device: PrecogDeviceContext;
  candidates: PrecogCandidate[];
}

/** One link and the probability that it is clicked next. */
export interface PrecogRank {
  id: string;
  p: number;
}

/** What the server returns. It never returns URLs, only ids the client sent. */
export interface PrecogPrediction {
  ranks: PrecogRank[];
  /** How soon a navigation is expected, 0 to 1. */
  soon: number;
  /** Probability that the visitor leaves the site instead, 0 to 1. */
  exit: number;
  cached: boolean;
  /** Server-side round trip to Jev, in milliseconds. */
  latencyMs: number;
  /** Input and output tokens of the underlying call, zero when cached. */
  usage?: { input: number; output: number };
}

// --- policy ---

export type PrecogAction = "prerender" | "prefetch" | "none";

export interface PrecogDecision {
  id: string;
  path: string;
  p: number;
  action: PrecogAction;
  /** Why the action is `none`, for the overlay and the devtools timeline. */
  reason?: string;
}

/** The result of the policy: what to speculate, in probability order. */
export interface PrecogPlan {
  decisions: PrecogDecision[];
  prerender: string[];
  prefetch: string[];
}

// --- speculation rules ---

export interface PrecogRuleSet {
  prerender?: Array<Record<string, unknown>>;
  prefetch?: Array<Record<string, unknown>>;
}

// --- metrics ---

export interface PrecogMetrics {
  /** Prediction calls made by this client. */
  calls: number;
  /** Calls the server answered from its cache. */
  cacheHits: number;
  /** Calls that failed or timed out. */
  errors: number;
  /** Why the last call failed, straight from the server. Empty once one succeeds. */
  lastError: string;
  /** Jev latencies in milliseconds, newest last. */
  latencies: number[];
  /** Navigations where the clicked link was in the speculated set. */
  hits: number;
  /** Navigations where the clicked link was the top ranked one. */
  topHits: number;
  /** Navigations tracked in total. */
  navigations: number;
  /** Speculated URLs that were never used. */
  wasted: number;
  /** Estimated input tokens spent, for the cost line in the HUD. */
  inputTokens: number;
  outputTokens: number;
  /** Navigations served from a prerender or prefetch, measured after activation. */
  activations: number;
}

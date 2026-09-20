/**
 * The client orchestrator: collect links, watch the visitor, ask the server, apply the plan.
 * Everything it touches outside the DOM is injected, so it can be driven from a test.
 */

import { buildCandidates, fingerprint } from "./candidates";
import { SpeculationEffector, supportsSpeculationRules as detectSupport } from "./effectors";
import { canPredict, plan as makePlan } from "./policy";
import { nativeRuleSet, toRuleSet } from "./rules";
import {
  boxUnder,
  nearestLinks,
  readBoxes,
  readConnection,
  readLinks,
  scrollDepthOf,
  scrollVelocityOf,
  velocityOf,
  type Box,
  type PointerSample,
} from "./signals";
import { buildState } from "./state";
import { Telemetry, type MetricsSummary, type Pricing } from "./telemetry";
import type {
  PrecogLink,
  PrecogPlan,
  PrecogPrediction,
  PrecogPublicOptions,
  PrecogState,
} from "./types";

/** A prediction that did not happen, carrying the server's reason for the overlay. */
export class PredictionFailed extends Error {
  override name = "PredictionFailed";
}

/** Why a prediction was asked for. Shown in the devtools timeline. */
export type PrecogTrigger = "route" | "scroll" | "pointer" | "dom" | "manual" | "visible";

export interface OrchestratorDeps {
  options: PrecogPublicOptions;
  pricing?: Pricing;
  /** Posts the state and resolves with a prediction, or null when the call failed. */
  post: (body: PrecogState, signal: AbortSignal) => Promise<PrecogPrediction | null>;
  /** Effector B, wired up by the plugin. */
  preload?: (paths: string[]) => void;
  emitDecision?: (plan: PrecogPlan, trigger: PrecogTrigger) => void;
  emitMetrics?: (summary: MetricsSummary) => void;
  now?: () => number;
}

/** How long the page must sit still after a scroll before it is worth a prediction. */
const SCROLL_PAUSE_MS = 150;
/** How long to wait for the DOM to settle after a mutation. */
const DOM_SETTLE_MS = 300;
/** Pointer samples kept for the velocity estimate. */
const POINTER_SAMPLES = 5;

export class Precog {
  readonly telemetry: Telemetry;
  readonly effector: SpeculationEffector;
  readonly supportsSpeculationRules = detectSupport();

  /** False once `pause()` was called. Only `resume()` puts it back. */
  enabled = true;
  consent: boolean;

  links: PrecogLink[] = [];
  prediction: PrecogPrediction | null = null;
  plan: PrecogPlan | null = null;
  lastTrigger: PrecogTrigger | null = null;

  #deps: OrchestratorDeps;
  #elements = new Map<string, Element>();
  #boxes: Box[] = [];
  #pointer: PointerSample[] = [];
  #hasHover = false;
  #hoveredId: string | null = null;
  #nearestIds: string[] = [];
  #scroll = { y: 0, t: 0, velocity: 0 };
  #enteredAt = 0;
  #history: string[] = [];
  #callTimes: number[] = [];
  #callsThisSession = 0;
  #controller: AbortController | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #scrollTimer: ReturnType<typeof setTimeout> | null = null;
  #domTimer: ReturnType<typeof setTimeout> | null = null;
  #observer: MutationObserver | null = null;
  #lastCallAt = 0;
  #pageOptOut = false;
  #frame = 0;
  #listeners: Array<() => void> = [];
  #started = false;

  constructor(deps: OrchestratorDeps) {
    this.#deps = deps;
    this.telemetry = new Telemetry(safeSessionStorage());
    this.effector = new SpeculationEffector();
    this.consent = !deps.options.privacy.requireConsent;
  }

  get options() {
    return this.#deps.options;
  }

  get metrics(): MetricsSummary {
    return this.telemetry.summary(this.#deps.pricing);
  }

  // --- lifecycle ---

  start() {
    if (this.#started) return;
    this.#started = true;
    this.#enteredAt = this.#now();
    this.#recordActivation();
    this.#listen();
    this.onRouteChange();
  }

  stop() {
    this.#started = false;
    this.#cancelPending();
    this.#controller?.abort();
    this.#controller = null;
    this.#observer?.disconnect();
    this.#observer = null;
    for (const off of this.#listeners) off();
    this.#listeners = [];
    this.effector.clear();
  }

  pause() {
    this.enabled = false;
    this.#stand();
  }

  resume() {
    this.enabled = true;
    this.schedule("manual");
  }

  /**
   * `definePageMeta({ precog: false })`. Kept apart from `pause()` so leaving an opted-out
   * page does not undo a `pause()` the application asked for.
   */
  setPageOptOut(optedOut: boolean) {
    if (this.#pageOptOut === optedOut) return;
    this.#pageOptOut = optedOut;
    if (optedOut) this.#stand();
    else this.schedule("manual");
  }

  /** Stops everything in flight and takes the rules back out of the document. */
  #stand() {
    this.#cancelPending();
    this.#controller?.abort();
    this.#clearPlan();
  }

  /**
   * Drops the plan and says so. Listeners such as the overlay draw from the plan, and the
   * links it names are gone or stale the moment the page changes.
   */
  #clearPlan() {
    this.effector.clear();
    if (!this.plan) return;
    this.plan = null;
    this.#deps.emitDecision?.({ decisions: [], prerender: [], prefetch: [] }, "route");
  }

  grantConsent() {
    this.consent = true;
    this.schedule("manual");
  }

  /** Called by the plugin after every finished navigation, with the path left behind. */
  onRouteChange(previousPath?: string | null) {
    if (previousPath) this.#history.push(previousPath);
    this.#history = this.#history.slice(-5);
    this.#enteredAt = this.#now();
    this.#scroll = { y: 0, t: this.#now(), velocity: 0 };
    this.prediction = null;
    this.#clearPlan();
    this.collect();
    this.schedule("route");
  }

  /** Forces a fresh prediction, ignoring the interval between calls. */
  refresh() {
    this.#lastCallAt = 0;
    this.collect();
    this.schedule("manual");
  }

  // --- collection ---

  collect() {
    if (!this.#active()) return;
    const previous = fingerprint(this.links);
    this.links = buildCandidates(readLinks(), {
      origin: location.origin,
      currentPath: location.pathname + location.search,
      viewport: { width: innerWidth, height: innerHeight },
      maxCandidates: this.options.maxCandidates,
      include: this.options.include,
      exclude: this.options.exclude,
      sendQuery: this.options.privacy.sendQuery,
      sendAnchorText: this.options.privacy.sendAnchorText,
    });
    this.#mapElements();
    return fingerprint(this.links) !== previous;
  }

  #mapElements() {
    this.#elements.clear();
    const byHref = new Map(this.links.map((link) => [link.href, link.id]));
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const id = byHref.get(anchor.href);
      if (id && !this.#elements.has(id)) this.#elements.set(id, anchor);
    }
    this.#boxes = readBoxes(this.#elements);
  }

  /** The element behind a candidate id, for the overlay. */
  elementOf(id: string): Element | undefined {
    return this.#elements.get(id);
  }

  // --- scheduling ---

  schedule(trigger: PrecogTrigger) {
    if (!this.#active()) return;
    if (this.#timer) return;
    const wait = Math.max(0, this.options.minIntervalMs - (this.#now() - this.#lastCallAt));
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.run(trigger);
    }, wait);
  }

  async run(trigger: PrecogTrigger) {
    if (!this.#active()) return;
    if (this.links.length === 0 && !this.collect()) return;
    if (this.links.length === 0) return;

    const connection = readConnection();
    this.#trimCallWindow();
    if (
      !canPredict({
        hidden: document.hidden,
        prerendering: isPrerendering(),
        saveData: connection.saveData,
        effectiveType: connection.effectiveType,
        consent: this.consent,
        callsThisMinute: this.#callTimes.length,
        callsThisSession: this.#callsThisSession,
        budget: this.options.budget,
      })
    ) {
      return;
    }

    const before = fingerprint(this.links);
    const state = this.#buildState(connection);

    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(this.options.timeoutMs),
    ]);

    this.#lastCallAt = this.#now();
    this.#callTimes.push(this.#lastCallAt);
    this.#callsThisSession++;
    this.telemetry.record({ calls: 1 });
    this.lastTrigger = trigger;

    let prediction: PrecogPrediction | null = null;
    let failure = "";
    try {
      prediction = await this.#deps.post(state, signal);
    } catch (error) {
      failure = error instanceof Error ? error.message : "request failed";
    }

    if (controller !== this.#controller) return;
    this.#controller = null;

    if (!prediction) {
      this.telemetry.record({ errors: 1, lastError: failure || "request failed" });
      this.#applyFallback();
      this.#emitMetrics();
      return;
    }
    // The page moved on while the request was in flight; the answer is about another page.
    if (fingerprint(this.links) !== before) return;

    this.telemetry.record({
      lastError: "",
      cacheHits: prediction.cached ? 1 : 0,
      inputTokens: prediction.usage?.input ?? 0,
      outputTokens: prediction.usage?.output ?? 0,
    });
    if (!prediction.cached) this.telemetry.recordLatency(prediction.latencyMs);

    this.prediction = prediction;
    this.apply(prediction, trigger);
    this.#emitMetrics();
  }

  apply(prediction: PrecogPrediction, trigger: PrecogTrigger = "manual") {
    const connection = readConnection();
    const next = makePlan(prediction, this.links, {
      mode: this.options.mode,
      thresholds: this.options.thresholds,
      budget: this.options.budget,
      saveData: connection.saveData,
      effectiveType: connection.effectiveType,
      hidden: document.hidden,
      prerendering: isPrerendering(),
      include: this.options.include,
      exclude: this.options.exclude,
      active: this.plan ?? undefined,
    });
    this.plan = next;
    this.effector.apply(toRuleSet(next));
    this.#deps.preload?.([...next.prerender, ...next.prefetch]);
    this.#deps.emitDecision?.(next, trigger);
  }

  #applyFallback() {
    if (this.options.fallback !== "native" || !this.supportsSpeculationRules) return;
    this.effector.apply(nativeRuleSet({ exclude: this.options.exclude }));
  }

  #buildState(connection: { saveData: boolean; effectiveType: string }) {
    const velocity = velocityOf(this.#pointer);
    const last = this.#pointer.at(-1);
    return buildState({
      page: {
        path: location.pathname + location.search,
        title: document.title,
        h1: document.querySelector("h1")?.textContent?.trim() ?? "",
        description:
          document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "",
      },
      session: {
        previousPaths: this.#history,
        timeOnPageMs: this.#now() - this.#enteredAt,
        scrollDepth: scrollDepthOf(scrollY, innerHeight, document.documentElement.scrollHeight),
        scrollVelocity: this.#scroll.velocity,
      },
      pointer: {
        hasHover: this.#hasHover,
        x: last ? (last.x / innerWidth) * 10 : 0,
        y: last ? (last.y / innerHeight) * 10 : 0,
        vx: (velocity.vx / innerWidth) * 10,
        vy: (velocity.vy / innerHeight) * 10,
        nearestIds: this.#nearestIds,
        hoveredId: this.#hoveredId,
      },
      device: connection,
      candidates: this.links,
      privacy: this.options.privacy,
    });
  }

  // --- browser events ---

  #listen() {
    this.#on(document, "visibilitychange", () => {
      if (document.hidden) this.#cancelPending();
      else this.schedule("visible");
    });

    this.#on(
      globalThis,
      "scroll",
      () => {
        const now = this.#now();
        this.#scroll.velocity = scrollVelocityOf(this.#scroll, { y: scrollY, t: now }, innerHeight);
        this.#scroll = { y: scrollY, t: now, velocity: this.#scroll.velocity };
        this.#boxes = readBoxes(this.#elements);
        if (this.#scrollTimer) clearTimeout(this.#scrollTimer);
        this.#scrollTimer = setTimeout(() => this.schedule("scroll"), SCROLL_PAUSE_MS);
      },
      { passive: true },
    );

    this.#on(globalThis, "pointermove", (event) => this.#onPointer(event as PointerEvent), {
      passive: true,
    });
    this.#on(globalThis, "pointerleave", () => {
      this.#hasHover = false;
      this.#hoveredId = null;
    });

    this.#on(document, "click", (event) => this.#onClick(event as MouseEvent), { capture: true });

    if (typeof MutationObserver !== "undefined") {
      this.#observer = new MutationObserver(() => {
        if (this.#domTimer) clearTimeout(this.#domTimer);
        this.#domTimer = setTimeout(() => {
          if (this.collect()) this.schedule("dom");
        }, DOM_SETTLE_MS);
      });
      this.#observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  /** rAF-throttled: a pointer can fire far more often than a frame. */
  #onPointer(event: PointerEvent) {
    this.#hasHover = true;
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#pointer.push({ x: event.clientX, y: event.clientY, t: performance.now() });
      if (this.#pointer.length > POINTER_SAMPLES) this.#pointer.shift();

      const velocity = velocityOf(this.#pointer);
      const point = { x: event.clientX, y: event.clientY };
      const nearest = nearestLinks(point, velocity, this.#boxes);
      const hovered = boxUnder(point, this.#boxes);
      const changed = hovered !== this.#hoveredId || nearest.join() !== this.#nearestIds.join();
      this.#nearestIds = nearest;
      this.#hoveredId = hovered;
      if (changed) this.schedule("pointer");
    });
  }

  /** Was the link the visitor clicked already being loaded? */
  #onClick(event: MouseEvent) {
    const anchor = (event.target as Element | null)?.closest?.(
      "a[href]",
    ) as HTMLAnchorElement | null;
    if (!anchor) return;
    const speculated = new Set([...(this.plan?.prerender ?? []), ...(this.plan?.prefetch ?? [])]);

    // Experimental: hand a prerendered link to the browser instead of the router, so the
    // navigation is the activation of a document that is already painted.
    if (
      this.options.documentNavigation &&
      this.plan?.prerender.includes(anchor.href) &&
      !isModifiedClick(event) &&
      anchor.target !== "_blank"
    ) {
      event.preventDefault();
      event.stopPropagation();
      location.href = anchor.href;
    }

    const top = this.plan?.decisions.find((decision) => decision.action !== "none");
    const topHref = top ? this.links.find((link) => link.id === top.id)?.href : undefined;
    this.telemetry.record({
      navigations: 1,
      hits: speculated.has(anchor.href) ? 1 : 0,
      topHits: anchor.href === topHref ? 1 : 0,
      wasted: speculated.has(anchor.href) ? speculated.size - 1 : speculated.size,
    });
    this.#emitMetrics();
  }

  /** Did this page arrive from a prerender or a prefetch? */
  #recordActivation() {
    const entry = performance.getEntriesByType("navigation")[0] as
      | (PerformanceEntry & { activationStart?: number; deliveryType?: string })
      | undefined;
    if (!entry) return;
    if ((entry.activationStart ?? 0) > 0 || entry.deliveryType === "navigational-prefetch") {
      this.telemetry.record({ activations: 1 });
    }
  }

  // --- helpers ---

  #active() {
    return (
      this.#started && this.enabled && !this.#pageOptOut && this.consent && this.options.enabled
    );
  }

  #now() {
    return (this.#deps.now ?? Date.now)();
  }

  #trimCallWindow() {
    const cutoff = this.#now() - 60_000;
    this.#callTimes = this.#callTimes.filter((time) => time > cutoff);
  }

  #cancelPending() {
    for (const timer of [this.#timer, this.#scrollTimer, this.#domTimer]) {
      if (timer) clearTimeout(timer);
    }
    this.#timer = null;
    this.#scrollTimer = null;
    this.#domTimer = null;
  }

  #emitMetrics() {
    this.#deps.emitMetrics?.(this.metrics);
  }

  #on(
    target: EventTarget,
    type: string,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, handler, options);
    this.#listeners.push(() => target.removeEventListener(type, handler, options));
  }
}

/** A click the visitor meant to open somewhere else, which must be left to the browser. */
function isModifiedClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function isPrerendering() {
  return (document as Document & { prerendering?: boolean }).prerendering === true;
}

function safeSessionStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

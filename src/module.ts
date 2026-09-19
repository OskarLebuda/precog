import { addPlugin, addServerHandler, createResolver, defineNuxtModule } from "@nuxt/kit";
import { defu } from "defu";
import type {
  PrecogBudget,
  PrecogCacheOptions,
  PrecogFallback,
  PrecogMode,
  PrecogOverlay,
  PrecogPrivacy,
  PrecogPublicOptions,
  PrecogThresholds,
} from "./runtime/types.ts";

export interface ModuleOptions {
  /** Turn the whole module off without removing it. */
  enabled: boolean;
  /** Path of the Nitro route that talks to Jev. */
  endpoint: string;
  /** Jev model name. */
  model: string;
  /** TypeSafe base URL. Set it to point tests at a mock server. */
  baseURL?: string;
  /** Which speculative loads the policy may plan. */
  mode: PrecogMode;
  thresholds: PrecogThresholds;
  budget: PrecogBudget;
  /** Most links sent in one request. Jev allows 255 choices, one of which is `none`. */
  maxCandidates: number;
  /** Client-side deadline for a prediction. */
  timeoutMs: number;
  /** Shortest gap between two predictions. */
  minIntervalMs: number;
  /** What to do when a prediction fails: native `moderate` document rules, or nothing. */
  fallback: PrecogFallback;
  /** Only these path globs may be speculated. Empty means every same-origin path. */
  include: string[];
  /** These path globs are never speculated. */
  exclude: string[];
  cache: PrecogCacheOptions;
  privacy: PrecogPrivacy;
  /** Mount the debug overlay always, never, or only in development. */
  overlay: PrecogOverlay;
  /** Experimental: render internal links as document navigations so prerender fully applies. */
  documentNavigation: boolean;
}

const defaults: ModuleOptions = {
  enabled: true,
  endpoint: "/_precog/predict",
  model: "jev-latest",
  baseURL: undefined,
  mode: "prefetch",
  thresholds: { prefetch: 0.25, prerender: 0.6 },
  budget: {
    maxPrefetch: 3,
    maxPrerender: 1,
    maxCallsPerMinute: 20,
    maxCallsPerSession: 200,
  },
  maxCandidates: 30,
  timeoutMs: 800,
  minIntervalMs: 1200,
  fallback: "native",
  include: [],
  exclude: ["/logout", "/signout", "/api/**", "/auth/**", "/cart/**"],
  cache: { ttlSeconds: 60 },
  privacy: {
    sendQuery: false,
    sendAnchorText: true,
    sendHistory: true,
    requireConsent: false,
  },
  overlay: "dev",
  documentNavigation: false,
};

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: "nuxt-precog",
    configKey: "precog",
    compatibility: { nuxt: ">=3.13.0" },
  },
  defaults,
  setup(options, nuxt) {
    if (!options.enabled) return;

    const resolver = createResolver(import.meta.url);
    const overlay = options.overlay === "dev" ? nuxt.options.dev : options.overlay;

    const publicOptions: PrecogPublicOptions = {
      enabled: options.enabled,
      endpoint: options.endpoint,
      mode: options.mode,
      thresholds: options.thresholds,
      budget: options.budget,
      maxCandidates: Math.min(options.maxCandidates, 254),
      timeoutMs: options.timeoutMs,
      minIntervalMs: options.minIntervalMs,
      fallback: options.fallback,
      include: options.include,
      exclude: options.exclude,
      privacy: options.privacy,
      overlay,
      documentNavigation: options.documentNavigation,
    };

    nuxt.options.runtimeConfig.public.precog = defu(
      nuxt.options.runtimeConfig.public.precog as Partial<PrecogPublicOptions>,
      publicOptions,
    );

    // The key stays server side. `NUXT_PRECOG_API_KEY` overrides it at run time.
    nuxt.options.runtimeConfig.precog = defu(
      nuxt.options.runtimeConfig.precog as Record<string, unknown>,
      {
        apiKey: "",
        model: options.model,
        baseURL: options.baseURL ?? "",
        maxCandidates: publicOptions.maxCandidates,
        timeoutMs: options.timeoutMs,
        cache: options.cache,
        privacy: options.privacy,
        budget: options.budget,
        include: options.include,
        exclude: options.exclude,
      },
    );

    addServerHandler({
      route: options.endpoint,
      method: "post",
      handler: resolver.resolve("./runtime/server/handlers/predict.post.ts"),
    });

    addPlugin({ src: resolver.resolve("./runtime/plugin.client.ts"), mode: "client" });
  },
});

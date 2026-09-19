import {
  addImports,
  addPlugin,
  addServerHandler,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from "@nuxt/kit";
import { defu } from "defu";
import { DEVTOOLS_ROUTE, setupDevtools } from "./devtools.ts";
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
  /**
   * Turn off `NuxtLink`'s blanket viewport prefetch and let precog choose instead. Prefetch
   * on interaction stays on, so hovering a link the model did not rank still warms it.
   */
  takeOverNuxtLinkPrefetch: boolean;
  /** Experimental: render internal links as document navigations so prerender fully applies. */
  documentNavigation: boolean;
  /** Prices for the overlay's cost estimate. Unset means the overlay shows tokens only. */
  pricing?: { inputPerMillion: number; outputPerMillion: number };
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
  takeOverNuxtLinkPrefetch: false,
  documentNavigation: false,
  pricing: undefined,
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
      takeOverNuxtLinkPrefetch: options.takeOverNuxtLinkPrefetch,
      documentNavigation: options.documentNavigation,
      ...(options.pricing ? { pricing: options.pricing } : {}),
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

    if (options.takeOverNuxtLinkPrefetch) {
      const defaults = (nuxt.options.experimental.defaults ??= {} as never);
      const link = (defaults.nuxtLink ??= {});
      link.prefetch = true;
      link.prefetchOn = { ...link.prefetchOn, visibility: false, interaction: true };
    }

    addServerHandler({
      route: options.endpoint,
      method: "post",
      handler: resolver.resolve("./runtime/server/handlers/predict.post.ts"),
    });

    addImports({
      name: "usePrecog",
      as: "usePrecog",
      from: resolver.resolve("./runtime/composables/usePrecog.ts"),
    });

    addPlugin({ src: resolver.resolve("./runtime/plugin.client.ts"), mode: "client" });

    // Registered only when the overlay is on, so a production build never sees the component.
    if (overlay) {
      addPlugin({ src: resolver.resolve("./runtime/plugin.overlay.client.ts"), mode: "client" });
    }

    if (nuxt.options.dev) {
      addServerHandler({
        route: DEVTOOLS_ROUTE,
        method: "get",
        handler: resolver.resolve("./runtime/server/handlers/devtools.get.ts"),
      });
      setupDevtools(nuxt);
    }
  },
});

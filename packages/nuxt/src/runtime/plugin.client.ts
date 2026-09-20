import {
  defineNuxtPlugin,
  preloadPayload,
  preloadRouteComponents,
  useRouter,
  useRuntimeConfig,
} from "#app";
import type { PrecogPrediction, PrecogPublicOptions } from "precog-core";
import { Precog, PredictionFailed } from "precog-core/client";

/** `?precog=off` turns the module off for a side-by-side recording. */
const OFF = "off";

export default defineNuxtPlugin({
  name: "nuxt-precog",
  setup(nuxtApp) {
    const options = useRuntimeConfig().public.precog as PrecogPublicOptions | undefined;
    if (!options?.enabled) return;
    if (new URLSearchParams(location.search).get("precog") === OFF) return;

    const router = useRouter();

    const precog = new Precog({
      options,
      pricing: options.pricing,
      post: async (body, signal) => {
        try {
          return await $fetch<PrecogPrediction>(options.endpoint, {
            method: "POST",
            body,
            signal,
            retry: false,
          });
        } catch (error) {
          // Fail open: the orchestrator applies the fallback and the page is untouched.
          // The server says why in a header; without it a failure is just a counter.
          const response = (error as { response?: { headers?: Headers; status?: number } })
            .response;
          throw new PredictionFailed(
            response?.headers?.get("x-precog-reason") ||
              (error instanceof Error ? error.message : "request failed"),
          );
        }
      },
      // Effector B: warm what the client router will actually need for an in-app navigation.
      preload: (urls) => {
        for (const url of urls) {
          const { pathname, search } = new URL(url);
          const path = pathname + search;
          // `preloadPayload` checks for itself whether the route has a payload to load.
          void preloadPayload(path).catch(() => {});
          // Route chunks only exist in a build, which is what Nuxt's own link does too.
          if (!import.meta.dev) void preloadRouteComponents(path, router).catch(() => {});
        }
      },
      emitDecision: (plan, trigger) => nuxtApp.callHook("precog:decision", plan, trigger),
      emitMetrics: (summary) => nuxtApp.callHook("precog:metrics", summary),
    });

    // Never before hydration: the first render has no boxes to measure.
    nuxtApp.hook("app:suspense:resolve", () => {
      precog.setPageOptOut(router.currentRoute.value.meta.precog === false);
      precog.start();
    });

    router.afterEach((to, from) => {
      precog.setPageOptOut(to.meta.precog === false);
      if (to.meta.precog === false) return;
      // Wait for the new page to be in the DOM before measuring it.
      nuxtApp.hook("page:finish", () => precog.onRouteChange(from.fullPath));
    });

    return { provide: { precog } };
  },
});

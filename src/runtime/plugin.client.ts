import { defineNuxtPlugin, useRouter, useRuntimeConfig } from "#app";
import { Precog } from "./core/orchestrator.ts";
import type { PrecogPrediction, PrecogPublicOptions } from "./types.ts";

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
        } catch {
          // Fail open: the orchestrator applies the fallback and the page is untouched.
          return null;
        }
      },
      emitDecision: (plan, trigger) => nuxtApp.callHook("precog:decision", plan, trigger),
      emitMetrics: (summary) => nuxtApp.callHook("precog:metrics", summary),
    });

    // Never before hydration: the first render has no boxes to measure.
    nuxtApp.hook("app:suspense:resolve", () => {
      if (router.currentRoute.value.meta.precog === false) return;
      precog.start();
    });

    router.afterEach((to, from) => {
      if (to.meta.precog === false) {
        precog.pause();
        return;
      }
      if (!precog.enabled) precog.resume();
      // Wait for the new page to be in the DOM before measuring it.
      nuxtApp.hook("page:finish", () => precog.onRouteChange(from.fullPath));
    });

    return { provide: { precog } };
  },
});

import { defineNuxtPlugin, useRuntimeConfig } from "#app";
import { createApp, h, shallowRef } from "vue";
import PrecogOverlay from "./components/PrecogOverlay.vue";
import type { PrecogPlan, PrecogPublicOptions } from "precog-core";
import type { MetricsSummary, Precog } from "precog-core/client";

export default defineNuxtPlugin({
  name: "nuxt-precog:overlay",
  dependsOn: ["nuxt-precog"],
  setup(nuxtApp) {
    const options = useRuntimeConfig().public.precog as PrecogPublicOptions | undefined;
    const precog = nuxtApp.$precog as Precog | undefined;
    if (!options?.overlay || !precog) return;

    const params = new URLSearchParams(location.search);
    const open = shallowRef(params.get("precog") === "debug");
    const plan = shallowRef<PrecogPlan | null>(null);
    const metrics = shallowRef<MetricsSummary | null>(null);

    // The DevTools tab reads the same hooks off the host app itself, so nothing is
    // broadcast here.
    nuxtApp.hook("precog:decision", (next) => {
      plan.value = next;
    });
    nuxtApp.hook("precog:metrics", (summary) => {
      metrics.value = summary;
    });

    addEventListener("keydown", (event) => {
      const key = event as KeyboardEvent;
      if (key.shiftKey && key.key.toLowerCase() === "p") open.value = !open.value;
    });

    const container = document.createElement("div");
    container.dataset.precog = "overlay";
    document.body.append(container);

    createApp({
      render: () =>
        h(PrecogOverlay, {
          precog,
          plan: plan.value,
          metrics: metrics.value,
          open: open.value,
        }),
    }).mount(container);
  },
});

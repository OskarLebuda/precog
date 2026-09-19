import { defineNuxtPlugin, useRuntimeConfig } from "#app";
import { createApp, h, shallowRef } from "vue";
import PrecogOverlay from "./components/PrecogOverlay.vue";
import type { Precog } from "./core/orchestrator.ts";
import type { MetricsSummary } from "./core/telemetry.ts";
import type { PrecogPlan, PrecogPublicOptions } from "./types.ts";

/** Sends decisions to the DevTools tab, which lives in an iframe of its own. */
const CHANNEL = "precog";

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

    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);

    nuxtApp.hook("precog:decision", (next, trigger) => {
      plan.value = next;
      channel?.postMessage({ type: "decision", at: Date.now(), trigger, plan: next });
    });
    nuxtApp.hook("precog:metrics", (summary) => {
      metrics.value = summary;
      channel?.postMessage({ type: "metrics", at: Date.now(), metrics: summary });
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

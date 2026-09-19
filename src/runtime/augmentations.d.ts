import type { MetricsSummary } from "./core/telemetry";
import type { Precog, PrecogTrigger } from "./core/orchestrator";
import type { PrecogPlan } from "./types";

declare module "#app" {
  interface NuxtApp {
    $precog?: Precog;
  }
  interface RuntimeNuxtHooks {
    /** Fired every time a new plan is applied. */
    "precog:decision": (plan: PrecogPlan, trigger: PrecogTrigger) => void;
    /** Fired when a counter changed. */
    "precog:metrics": (summary: MetricsSummary) => void;
  }
}

declare module "vue-router" {
  interface RouteMeta {
    /** `definePageMeta({ precog: false })` turns the module off for one page. */
    precog?: boolean;
  }
}

export {};

/**
 * The browser half: the orchestrator that decides when to ask, the effectors that apply an
 * answer, and the counters behind the overlay. Everything an adapter has to provide is
 * injected, so this file never imports a framework.
 */

export { Precog, PredictionFailed } from "./orchestrator";
export type { OrchestratorDeps, PrecogTrigger } from "./orchestrator";
export { SpeculationEffector, supportsSpeculationRules, MARKER } from "./effectors";
export {
  boxUnder,
  nearestLinks,
  readBoxes,
  readConnection,
  readLinks,
  scrollDepthOf,
  scrollVelocityOf,
  velocityOf,
} from "./signals";
export type { Box, Point, PointerSample, Velocity } from "./signals";
export { emptyMetrics, estimateCost, percentile, summarize, Telemetry } from "./telemetry";
export type { MetricsSummary, Pricing } from "./telemetry";

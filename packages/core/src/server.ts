/**
 * The prediction endpoint's logic, with no HTTP framework attached. An adapter validates a
 * request with `validateState`, guards it with `isSameSite` and a `RateLimiter`, then hands
 * the result to `runPrediction`.
 */

export { runPrediction, toRanks, toRatio } from "./server/predict";
export type {
  PredictDeps,
  PredictedHookContext,
  PredictHookContext,
  PredictResult,
  PredictStorage,
} from "./server/predict";
export { isSameSite, normalizePath, validateState } from "./server/validate";
export type { Validation, ValidateOptions } from "./server/validate";
export { cacheKey, hash } from "./server/cache";
export { RateLimiter, take } from "./server/ratelimit";
export type { Bucket, Limit } from "./server/ratelimit";
export { buildQuestions, sanitize, toOptions, NONE, SOON_LEVELS } from "./server/questions";
export type { PrecogQuestions } from "./server/questions";
export { createMemoryStorage } from "./server/memory";
export { readEnv } from "./server/env";

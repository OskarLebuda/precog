/**
 * The parts that do not care which framework you use: what counts as a candidate link, what
 * the state sent to Jev looks like, and how probabilities turn into speculative loads.
 *
 * Browser-only code lives in `@precog/core/client`, and the prediction endpoint's own logic
 * in `@precog/core/server`.
 */

export { buildCandidates, fingerprint, toPath, toWire } from "./candidates";
export type { CandidateContext, RawLink } from "./candidates";
export { isAllowedPath, matchesAny } from "./match";
export { canPredict, effectiveProbability, isSlow, plan } from "./policy";
export type { PolicyContext } from "./policy";
export { nativeRuleSet, serialize, toHrefPattern, toRuleSet, NATIVE_TAG, TAG } from "./rules";
export type { RuleOptions } from "./rules";
export { buildState } from "./state";
export type { StateInput } from "./state";
export type * from "./types";

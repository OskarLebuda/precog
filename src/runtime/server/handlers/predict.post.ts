import {
  defineEventHandler,
  getRequestHeader,
  getRequestIP,
  readRawBody,
  setResponseHeader,
  setResponseStatus,
} from "h3";
import { useNitroApp, useRuntimeConfig, useStorage } from "nitropack/runtime";
import { readEnv } from "../utils/env";
import { RateLimiter } from "../utils/ratelimit";
import {
  runPrediction,
  type PredictedHookContext,
  type PredictHookContext,
  type PredictStorage,
} from "../utils/predict";
import { isSameSite, validateState } from "../utils/validate";
import type { PrecogBudget, PrecogPrivacy, PrecogPrediction } from "../../types";

/** A prediction state never needs more than this. Anything larger is not from our client. */
const MAX_BODY_BYTES = 16 * 1024;

interface PrecogServerConfig {
  apiKey: string;
  model: string;
  baseURL: string;
  maxCandidates: number;
  timeoutMs: number;
  cache: { ttlSeconds: number };
  privacy: PrecogPrivacy;
  budget: PrecogBudget;
  include?: string[];
  exclude?: string[];
}

const EMPTY: PrecogPrediction = { ranks: [], soon: 0, exit: 0, cached: false, latencyMs: 0 };

let limiter: RateLimiter | undefined;

export default defineEventHandler(async (event): Promise<PrecogPrediction> => {
  const config = useRuntimeConfig(event).precog as unknown as PrecogServerConfig;

  const fail = (status: number, reason: string) => {
    setResponseStatus(event, status);
    setResponseHeader(event, "x-precog-reason", reason);
    return EMPTY;
  };

  if (
    !isSameSite({
      origin: getRequestHeader(event, "origin") ?? null,
      secFetchSite: getRequestHeader(event, "sec-fetch-site") ?? null,
      host: getRequestHeader(event, "host") ?? null,
    })
  ) {
    return fail(403, "cross-site");
  }

  const raw = await readRawBody(event, "utf8");
  if (!raw) return fail(400, "empty body");
  if (raw.length > MAX_BODY_BYTES) return fail(413, "body too large");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "malformed json");
  }

  const validation = validateState(body, {
    maxCandidates: config.maxCandidates,
    sendQuery: config.privacy.sendQuery,
    sendAnchorText: config.privacy.sendAnchorText,
    sendHistory: config.privacy.sendHistory,
    include: config.include,
    exclude: config.exclude,
  });
  if (!validation.ok) return fail(400, validation.reason);

  limiter ??= new RateLimiter({
    capacity: config.budget.maxCallsPerMinute,
    windowMs: 60_000,
  });
  const gate = limiter.check(getRequestIP(event, { xForwardedFor: true }) ?? "unknown");
  if (!gate.ok) {
    setResponseHeader(event, "retry-after", Math.ceil(gate.retryAfterMs / 1000));
    return fail(429, "rate limited");
  }

  const nitro = useNitroApp();
  const hooks = nitro.hooks as unknown as {
    callHook: (name: string, ctx: unknown) => Promise<void>;
  };
  const { status, prediction } = await runPrediction(validation.state, {
    // `NUXT_PRECOG_API_KEY` is handled by Nuxt; `TYPESAFE_API_KEY` is advocaat's own name.
    apiKey: config.apiKey || readEnv("TYPESAFE_API_KEY") || "",
    baseURL: config.baseURL || readEnv("TYPESAFE_BASE_URL") || undefined,
    model: config.model,
    timeoutMs: config.timeoutMs,
    ttlSeconds: config.cache.ttlSeconds,
    storage: useStorage("cache") as unknown as PredictStorage,
    hook: (ctx: PredictHookContext) =>
      (
        nitro.hooks as unknown as { callHook: (name: string, ctx: unknown) => Promise<void> }
      ).callHook("precog:predict", ctx),
  });

  setResponseHeader(
    event,
    "server-timing",
    `jev;dur=${prediction.latencyMs}${prediction.cached ? ", cache;desc=hit" : ""}`,
  );
  // Predictions are for this visitor at this moment and must never be shared or stored.
  setResponseHeader(event, "cache-control", "no-store");
  if (status !== 200) setResponseStatus(event, status);
  return prediction;
});

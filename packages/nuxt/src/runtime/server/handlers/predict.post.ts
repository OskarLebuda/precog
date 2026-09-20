import {
  defineEventHandler,
  getRequestHeader,
  getRequestIP,
  readRawBody,
  setResponseHeader,
  setResponseStatus,
} from "h3";
import { useNitroApp, useRuntimeConfig, useStorage } from "nitropack/runtime";
import type { PrecogBudget, PrecogPrediction, PrecogPrivacy } from "precog-core";
import { RateLimiter, isSameSite, readEnv, validateState } from "precog-core/server";
import {
  runPrediction,
  type PredictedHookContext,
  type PredictHookContext,
  type PredictStorage,
} from "precog-core/server";

/** A prediction state never needs more than this. Anything larger is not from our client. */
const MAX_BODY_BYTES = 16 * 1024;

interface PrecogServerConfig {
  apiKey: string;
  model: string;
  baseURL: string;
  provider: "typesafe" | "vercel" | "";
  maxCandidates: number;
  timeoutMs: number;
  cache: { ttlSeconds: number };
  privacy: PrecogPrivacy;
  budget: PrecogBudget;
  include?: string[];
  exclude?: string[];
}

const EMPTY: PrecogPrediction = { ranks: [], soon: 0, exit: 0, cached: false, latencyMs: 0 };

/**
 * Works out which key to use and which service it belongs to.
 *
 * `NUXT_PRECOG_API_KEY` is handled by Nuxt, `TYPESAFE_API_KEY` is advocaat's own name for a
 * direct key, and `AI_GATEWAY_API_KEY` is a Vercel AI Gateway key. A gateway key only works
 * against the gateway, so finding one there picks the provider as well.
 */
function credentials(config: PrecogServerConfig) {
  const direct = config.apiKey || readEnv("TYPESAFE_API_KEY");
  const gateway = readEnv("AI_GATEWAY_API_KEY");
  const provider = config.provider || (!direct && gateway ? "vercel" : undefined);
  return {
    apiKey: direct || gateway || "",
    baseURL: config.baseURL || readEnv("TYPESAFE_BASE_URL") || undefined,
    // Unset means advocaat picks: `jev-latest` directly, `typesafe-ai/jev` through the gateway.
    model: config.model || undefined,
    provider,
  };
}

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
  const { status, prediction, reason } = await runPrediction(validation.state, {
    ...credentials(config),
    timeoutMs: config.timeoutMs,
    ttlSeconds: config.cache.ttlSeconds,
    storage: useStorage("cache") as unknown as PredictStorage,
    hook: (ctx: PredictHookContext) => hooks.callHook("precog:predict", ctx),
    afterHook: (ctx: PredictedHookContext) => hooks.callHook("precog:predicted", ctx),
  });

  setResponseHeader(
    event,
    "server-timing",
    `jev;dur=${prediction.latencyMs}${prediction.cached ? ", cache;desc=hit" : ""}`,
  );
  // Predictions are for this visitor at this moment and must never be shared or stored.
  setResponseHeader(event, "cache-control", "no-store");
  if (status !== 200) {
    setResponseStatus(event, status);
    if (reason) setResponseHeader(event, "x-precog-reason", reason);
  }
  return prediction;
});

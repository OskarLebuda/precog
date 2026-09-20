/**
 * The prediction endpoint as a Next.js Route Handler.
 *
 * ```ts
 * // app/api/precog/route.ts
 * import { createPrecogHandler } from "next-precog/server";
 *
 * export const POST = createPrecogHandler();
 * ```
 *
 * The API key stays here. It is read from the environment on the server and never sent to the
 * browser, which is the whole reason this route exists instead of calling Jev from the client.
 */

import {
  RateLimiter,
  createMemoryStorage,
  isSameSite,
  readEnv,
  runPrediction,
  validateState,
  type PredictStorage,
  type PredictedHookContext,
  type PredictHookContext,
} from "precog-core/server";
import type { PrecogPrediction } from "precog-core";
import { defaults } from "./options";

/** A prediction state never needs more than this. Anything larger is not from our client. */
const MAX_BODY_BYTES = 16 * 1024;

const EMPTY: PrecogPrediction = { ranks: [], soon: 0, exit: 0, cached: false, latencyMs: 0 };

export interface PrecogHandlerOptions {
  /** Defaults to `TYPESAFE_API_KEY`, then `AI_GATEWAY_API_KEY`. */
  apiKey?: string;
  /** Which service the key belongs to. Unset, an `AI_GATEWAY_API_KEY` picks the gateway. */
  provider?: "typesafe" | "vercel";
  /** Leave unset so advocaat picks the right model for the provider. */
  model?: string;
  baseURL?: string;
  /** Deadline for the call to Jev. */
  timeoutMs?: number;
  /** Most links accepted in one request. */
  maxCandidates?: number;
  /** How long a prediction stays reusable. */
  cacheTtlSeconds?: number;
  /** Calls allowed per caller per minute. */
  maxCallsPerMinute?: number;
  include?: string[];
  exclude?: string[];
  privacy?: Partial<typeof defaults.privacy>;
  /** Swap in another storage, for example Redis, instead of the in-process cache. */
  storage?: PredictStorage;
  /** Read the state or set `ctx.prediction` to answer without calling Jev. */
  onPredict?: (ctx: PredictHookContext) => unknown | Promise<unknown>;
  /** Every fresh prediction, for recording or logging. */
  onPredicted?: (ctx: PredictedHookContext) => unknown | Promise<unknown>;
}

/**
 * Works out which key to use and which service it belongs to. A gateway key only works against
 * the gateway, so finding one there picks the provider as well.
 */
function credentials(options: PrecogHandlerOptions) {
  const direct = options.apiKey || readEnv("TYPESAFE_API_KEY");
  const gateway = readEnv("AI_GATEWAY_API_KEY");
  return {
    apiKey: direct || gateway || "",
    provider: options.provider || (!direct && gateway ? ("vercel" as const) : undefined),
    baseURL: options.baseURL || readEnv("TYPESAFE_BASE_URL") || undefined,
    model: options.model || undefined,
  };
}

/** The caller, for rate limiting. Behind a proxy the first forwarded address is the client. */
function callerOf(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

const fail = (status: number, reason: string) =>
  Response.json(EMPTY, {
    status,
    headers: { "x-precog-reason": reason, "cache-control": "no-store" },
  });

export function createPrecogHandler(options: PrecogHandlerOptions = {}) {
  const privacy = { ...defaults.privacy, ...options.privacy };
  const storage = options.storage ?? createMemoryStorage();
  const limiter = new RateLimiter({
    capacity: options.maxCallsPerMinute ?? defaults.budget.maxCallsPerMinute,
    windowMs: 60_000,
  });

  return async function POST(request: Request): Promise<Response> {
    if (
      !isSameSite({
        origin: request.headers.get("origin"),
        secFetchSite: request.headers.get("sec-fetch-site"),
        host: request.headers.get("host"),
      })
    ) {
      return fail(403, "cross-site");
    }

    const raw = await request.text();
    if (!raw) return fail(400, "empty body");
    if (raw.length > MAX_BODY_BYTES) return fail(413, "body too large");

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(400, "malformed json");
    }

    const validation = validateState(body, {
      maxCandidates: options.maxCandidates ?? defaults.maxCandidates,
      sendQuery: privacy.sendQuery,
      sendAnchorText: privacy.sendAnchorText,
      sendHistory: privacy.sendHistory,
      include: options.include ?? defaults.include,
      exclude: options.exclude ?? defaults.exclude,
    });
    if (!validation.ok) return fail(400, validation.reason);

    const gate = limiter.check(callerOf(request));
    if (!gate.ok) {
      return Response.json(EMPTY, {
        status: 429,
        headers: {
          "x-precog-reason": "rate limited",
          "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)),
          "cache-control": "no-store",
        },
      });
    }

    const { status, prediction, reason } = await runPrediction(validation.state, {
      ...credentials(options),
      timeoutMs: options.timeoutMs ?? defaults.timeoutMs,
      ttlSeconds: options.cacheTtlSeconds ?? 60,
      storage,
      hook: options.onPredict,
      afterHook: options.onPredicted,
    });

    const headers: Record<string, string> = {
      "server-timing": `jev;dur=${prediction.latencyMs}${prediction.cached ? ", cache;desc=hit" : ""}`,
      // Predictions are for this visitor at this moment and must never be shared or stored.
      "cache-control": "no-store",
    };
    if (reason) headers["x-precog-reason"] = reason;

    return Response.json(prediction, { status, headers });
  };
}

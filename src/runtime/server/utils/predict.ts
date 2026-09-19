/**
 * The prediction itself, kept free of h3 so it can be tested offline against a mock
 * TypeSafe server. The route in `handlers/predict.post.ts` is a thin wrapper around it.
 */

import { typesafe } from "advocaat";
import type { ChoiceAnswer, NoulAnswer, ScoreAnswer } from "advocaat";
import { cacheKey } from "./cache";
import { buildQuestions, NONE, SOON_LEVELS } from "./questions";
import type { PrecogPrediction, PrecogRank, PrecogState } from "../../types";

/** What a `precog:predict` listener may read and replace. */
export interface PredictHookContext {
  state: PrecogState;
  /** Set this to answer without calling Jev. */
  prediction: PrecogPrediction | null;
}

/** What a `precog:predicted` listener sees, after Jev answered. Read only. */
export interface PredictedHookContext {
  state: PrecogState;
  prediction: PrecogPrediction;
  /** True when the answer came from the `precog:predict` hook rather than from Jev. */
  substituted: boolean;
}

/** The little bit of Nitro storage the cache needs. */
export interface PredictStorage {
  getItem: (key: string) => Promise<unknown>;
  setItem: (key: string, value: unknown, options?: { ttl?: number }) => Promise<void>;
}

export interface PredictDeps {
  apiKey: string;
  baseURL?: string;
  model: string;
  timeoutMs: number;
  ttlSeconds: number;
  fetch?: typeof globalThis.fetch;
  storage?: PredictStorage;
  hook?: (ctx: PredictHookContext) => unknown | Promise<unknown>;
  /** Called with every fresh prediction, for recording and for analytics. */
  afterHook?: (ctx: PredictedHookContext) => unknown | Promise<unknown>;
  now?: () => number;
}

export interface PredictResult {
  status: number;
  prediction: PrecogPrediction;
  /** Why the call failed, for the `x-precog-reason` header. Absent on success. */
  reason?: string;
}

const EMPTY: PrecogPrediction = {
  ranks: [],
  soon: 0,
  exit: 0,
  cached: false,
  latencyMs: 0,
};

/** Clamped to 0 to 1 and rounded, so the response is short and stable enough to cache. */
const clamp01 = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000
    : 0;

/**
 * Keeps only the ids the server itself put in the request. Jev is constrained to those keys,
 * and this is the check that keeps it that way even if a response says otherwise.
 */
export function toRanks(answer: ChoiceAnswer, allowed: ReadonlySet<string>): PrecogRank[] {
  const probabilities = answer.probabilities ?? {};
  const entries = Object.entries(probabilities).filter(([id]) => id !== NONE && allowed.has(id));
  // AI Gateway omits probabilities; fall back to the single chosen option.
  if (entries.length === 0) {
    return allowed.has(answer.choice) ? [{ id: answer.choice, p: clamp01(answer.confidence) }] : [];
  }
  return entries
    .map(([id, p]) => ({ id, p: clamp01(p) }))
    .sort((a, b) => b.p - a.p || a.id.localeCompare(b.id));
}

/** Score to a 0 to 1 ratio, the way `ask()` does it. */
export function toRatio(answer: ScoreAnswer, levels = SOON_LEVELS.length): number {
  return clamp01(answer.score / (levels - 1));
}

async function readCache(storage: PredictStorage | undefined, key: string) {
  if (!storage) return null;
  try {
    const hit = await storage.getItem(key);
    return hit && typeof hit === "object" ? (hit as PrecogPrediction) : null;
  } catch {
    return null;
  }
}

async function writeCache(
  storage: PredictStorage | undefined,
  key: string,
  value: PrecogPrediction,
  ttlSeconds: number,
) {
  if (!storage || ttlSeconds <= 0) return;
  try {
    await storage.setItem(key, value, { ttl: ttlSeconds });
  } catch {
    // A cache that cannot be written is not a reason to fail the request.
  }
}

/**
 * Cache, then the `precog:predict` hook, then Jev. Any failure comes back as 503 with an
 * empty prediction, so the client falls open instead of waiting.
 */
export async function runPrediction(state: PrecogState, deps: PredictDeps): Promise<PredictResult> {
  const now = deps.now ?? Date.now;
  const key = cacheKey(state, deps.model);

  const cached = await readCache(deps.storage, key);
  // Usage is zeroed so a cache hit does not count again towards the estimated cost.
  if (cached) {
    return { status: 200, prediction: { ...cached, cached: true, usage: { input: 0, output: 0 } } };
  }

  if (deps.hook) {
    const ctx: PredictHookContext = { state, prediction: null };
    // A listener that throws must not cost the visitor their prediction.
    const failed = await settle(() => deps.hook!(ctx));
    if (failed) return { status: 503, prediction: EMPTY, reason: failed };
    if (ctx.prediction) {
      const prediction = { ...ctx.prediction, cached: false };
      await writeCache(deps.storage, key, prediction, deps.ttlSeconds);
      await settle(() => deps.afterHook?.({ state, prediction, substituted: true }));
      return { status: 200, prediction };
    }
  }

  if (!deps.apiKey) return { status: 503, prediction: EMPTY, reason: "no api key" };

  const started = now();
  try {
    const client = typesafe({
      apiKey: deps.apiKey,
      ...(deps.baseURL ? { baseURL: deps.baseURL } : {}),
      model: deps.model,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    });
    const result = await client.systemOne(
      { state: state as unknown as Record<string, never>, questions: buildQuestions(state) },
      { signal: AbortSignal.timeout(deps.timeoutMs) },
    );
    const answers = result.answers as {
      next: ChoiceAnswer;
      soon: ScoreAnswer;
      exit: NoulAnswer;
    };
    const allowed = new Set(state.candidates.map((candidate) => candidate.id));
    const prediction: PrecogPrediction = {
      ranks: toRanks(answers.next, allowed),
      soon: toRatio(answers.soon),
      exit: clamp01(answers.exit.noul),
      cached: false,
      latencyMs: now() - started,
      usage: {
        input: result.usage?.input_tokens ?? 0,
        output: result.usage?.output_tokens ?? 0,
      },
    };
    await writeCache(deps.storage, key, prediction, deps.ttlSeconds);
    // `precog:predicted` only observes. Whatever it does, the answer is already good.
    await settle(() => deps.afterHook?.({ state, prediction, substituted: false }));
    return { status: 200, prediction };
  } catch (error) {
    // Swallowed on purpose: the client falls open. The reason goes out as a header so a
    // misconfigured endpoint is not invisible.
    return {
      status: 503,
      prediction: { ...EMPTY, latencyMs: now() - started },
      reason: describe(error),
    };
  }
}

/** Runs a listener and returns why it failed, or nothing when it did not. */
async function settle(run: () => unknown): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return describe(error);
  }
}

/** A short, safe description of a failure. Never the request body or the key. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as { status?: number }).status;
    return `${error.name}${status ? ` ${status}` : ""}: ${error.message}`.slice(0, 200);
  }
  return "unknown error";
}

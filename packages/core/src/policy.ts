/** Turns probabilities into speculative loads. Pure, so every guard and budget is unit tested. */

import { isAllowedPath } from "./match";
import type {
  PrecogBudget,
  PrecogDecision,
  PrecogLink,
  PrecogMode,
  PrecogPlan,
  PrecogPrediction,
  PrecogThresholds,
} from "./types";

/** How soon a navigation must look before a prerender is worth its cost. */
const PRERENDER_SOON = 0.5;
/**
 * A link that is already speculated keeps its slot while it stays above this share of the
 * threshold, so a wobbling probability does not cancel and restart the same load.
 */
const HYSTERESIS = 0.75;

export interface PolicyContext {
  mode: PrecogMode;
  thresholds: PrecogThresholds;
  budget: PrecogBudget;
  /** Connection hints. Either one turns everything off. */
  saveData?: boolean;
  effectiveType?: string;
  /** The tab is in the background. */
  hidden?: boolean;
  /** This document is itself being prerendered. */
  prerendering?: boolean;
  include?: readonly string[];
  exclude?: readonly string[];
  /** What is speculated right now, so decisions stay stable between predictions. */
  active?: { prerender: readonly string[]; prefetch: readonly string[] };
}

const EMPTY_PLAN: PrecogPlan = { decisions: [], prerender: [], prefetch: [] };

/** Connections where any speculative load costs the visitor more than it saves. */
export function isSlow(effectiveType?: string) {
  return effectiveType === "2g" || effectiveType === "slow-2g";
}

/** True when the client may spend a call on a prediction right now. */
export function canPredict(ctx: {
  hidden?: boolean;
  prerendering?: boolean;
  saveData?: boolean;
  effectiveType?: string;
  consent?: boolean;
  callsThisMinute: number;
  callsThisSession: number;
  budget: PrecogBudget;
}): boolean {
  if (ctx.consent === false) return false;
  if (ctx.hidden || ctx.prerendering) return false;
  if (ctx.saveData || isSlow(ctx.effectiveType)) return false;
  if (ctx.callsThisMinute >= ctx.budget.maxCallsPerMinute) return false;
  return ctx.callsThisSession < ctx.budget.maxCallsPerSession;
}

/** Probability of a click on this link, discounted by the chance the visitor leaves the site. */
export function effectiveProbability(p: number, exit: number): number {
  return Math.max(0, Math.min(1, p)) * (1 - Math.max(0, Math.min(1, exit)));
}

function threshold(base: number, active: boolean) {
  return active ? base * HYSTERESIS : base;
}

/**
 * Ranks the candidates by discounted probability and assigns each one an action within the
 * budgets. Anything the guards reject comes back as `none` with a reason, for the overlay.
 */
export function plan(
  prediction: PrecogPrediction,
  links: readonly PrecogLink[],
  ctx: PolicyContext,
): PrecogPlan {
  if (ctx.hidden || ctx.prerendering) return EMPTY_PLAN;
  if (ctx.saveData || isSlow(ctx.effectiveType)) return EMPTY_PLAN;

  const byId = new Map(links.map((link) => [link.id, link]));
  const activePrerender = new Set(ctx.active?.prerender ?? []);
  const activePrefetch = new Set(ctx.active?.prefetch ?? []);

  const ranked = prediction.ranks
    .filter((rank) => byId.has(rank.id))
    .map((rank) => ({ link: byId.get(rank.id)!, p: effectiveProbability(rank.p, prediction.exit) }))
    .sort((a, b) => b.p - a.p || a.link.id.localeCompare(b.link.id));

  const allowPrerender = ctx.mode === "prerender" || ctx.mode === "auto";
  const allowPrefetch = ctx.mode === "prefetch" || ctx.mode === "auto";
  const soonEnough = prediction.soon >= PRERENDER_SOON;

  const decisions: PrecogDecision[] = [];
  const prerender: string[] = [];
  const prefetch: string[] = [];
  const taken = new Set<string>();

  for (const { link, p } of ranked) {
    const decide = (action: PrecogDecision["action"], reason?: string) => {
      decisions.push({
        id: link.id,
        path: link.path,
        p: Math.round(p * 1000) / 1000,
        action,
        reason,
      });
    };

    if (taken.has(link.href)) {
      decide("none", "duplicate");
      continue;
    }
    if (!isAllowedPath(link.path, ctx.include, ctx.exclude)) {
      decide("none", "excluded");
      continue;
    }

    const canPrerender =
      allowPrerender &&
      !link.blank &&
      soonEnough &&
      p >= threshold(ctx.thresholds.prerender, activePrerender.has(link.href)) &&
      prerender.length < ctx.budget.maxPrerender;

    if (canPrerender) {
      prerender.push(link.href);
      taken.add(link.href);
      decide("prerender");
      continue;
    }

    const canPrefetch =
      allowPrefetch &&
      p >= threshold(ctx.thresholds.prefetch, activePrefetch.has(link.href)) &&
      prefetch.length < ctx.budget.maxPrefetch;

    if (canPrefetch) {
      prefetch.push(link.href);
      taken.add(link.href);
      decide("prefetch");
      continue;
    }

    decide("none", p < ctx.thresholds.prefetch ? "below threshold" : "budget");
  }

  return { decisions, prerender, prefetch };
}

/** Builds the JSON state sent to Jev. Pure: rounds, clamps and applies the privacy options. */

import { toWire } from "./candidates.ts";
import type {
  PrecogCandidate,
  PrecogDeviceContext,
  PrecogLink,
  PrecogPointerContext,
  PrecogPrivacy,
  PrecogSessionContext,
  PrecogState,
} from "../types.ts";

/** Raw, unrounded signals gathered on the client. */
export interface StateInput {
  page: { path: string; title: string; h1: string; description: string };
  session: {
    previousPaths: readonly string[];
    timeOnPageMs: number;
    scrollDepth: number;
    scrollVelocity: number;
  };
  pointer: {
    hasHover: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
    nearestIds: readonly string[];
    hoveredId: string | null;
  };
  device: { saveData: boolean; effectiveType: string };
  candidates: readonly PrecogLink[];
  privacy: PrecogPrivacy;
}

/** Longest page title and description sent, so a long page cannot blow up the state. */
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 200;
/** Earlier paths sent, newest last. */
const MAX_HISTORY = 5;
/** Candidate ids the pointer is heading towards. */
const MAX_NEAREST = 3;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function stripQuery(path: string, keepQuery: boolean) {
  return keepQuery ? path : (path.split("?")[0] ?? path);
}

export function buildState(input: StateInput): PrecogState {
  const { privacy } = input;

  const session: PrecogSessionContext = {
    previousPaths: privacy.sendHistory
      ? input.session.previousPaths
          .slice(-MAX_HISTORY)
          .map((path) => stripQuery(path, privacy.sendQuery))
      : [],
    timeOnPageMs: Math.round(clamp(input.session.timeOnPageMs, 0, 600_000)),
    scrollDepth: round(clamp(input.session.scrollDepth, 0, 1)),
    scrollVelocity: round(clamp(input.session.scrollVelocity, -20, 20), 1),
  };

  const pointer: PrecogPointerContext = {
    hasHover: input.pointer.hasHover,
    x: Math.round(clamp(input.pointer.x, -10, 20)),
    y: Math.round(clamp(input.pointer.y, -10, 20)),
    vx: round(clamp(input.pointer.vx, -100, 100), 1),
    vy: round(clamp(input.pointer.vy, -100, 100), 1),
    nearestIds: input.pointer.nearestIds.slice(0, MAX_NEAREST),
    hoveredId: input.pointer.hoveredId,
  };

  const device: PrecogDeviceContext = {
    saveData: input.device.saveData,
    effectiveType: input.device.effectiveType,
  };

  const candidates: PrecogCandidate[] = toWire(input.candidates);

  return {
    page: {
      path: stripQuery(input.page.path, privacy.sendQuery),
      title: input.page.title.slice(0, MAX_TITLE),
      h1: input.page.h1.slice(0, MAX_TITLE),
      description: input.page.description.slice(0, MAX_DESCRIPTION),
    },
    session,
    pointer,
    device,
    candidates,
  };
}

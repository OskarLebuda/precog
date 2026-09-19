/** Rebuilds a trusted state from an untrusted request body. Pure, so every rejection is tested. */

import { isAllowedPath } from "../../core/match.ts";
import { sanitize } from "./questions.ts";
import type { PrecogCandidate, PrecogState } from "../../types.ts";

export interface ValidateOptions {
  maxCandidates: number;
  sendQuery: boolean;
  sendAnchorText: boolean;
  sendHistory: boolean;
  include?: readonly string[];
  exclude?: readonly string[];
}

export type Validation = { ok: true; state: PrecogState } | { ok: false; reason: string };

const MAX_PATH = 512;
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 200;
const MAX_HISTORY = 5;
const MAX_NEAREST = 3;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown, max: number) =>
  typeof value === "string" ? sanitize(value, max) : "";

const bool = (value: unknown) => value === true;

const num = (value: unknown, min: number, max: number, digits = 2) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(Math.max(min, Math.min(max, value)) * factor) / factor;
};

/**
 * A same-origin path, or `null`. Anything with a scheme, an authority, a backslash or a
 * control character is rejected rather than cleaned up.
 */
export function normalizePath(value: unknown, keepQuery: boolean): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_PATH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\s]|[\u0000-\u001F\u007F]/.test(value)) return null;
  const hash = value.indexOf("#");
  const withoutHash = hash === -1 ? value : value.slice(0, hash);
  if (keepQuery) return withoutHash;
  const query = withoutHash.indexOf("?");
  return query === -1 ? withoutHash : withoutHash.slice(0, query);
}

function validateCandidates(value: unknown, options: ValidateOptions): PrecogCandidate[] | string {
  if (!Array.isArray(value)) return "candidates must be an array";
  if (value.length === 0) return "no candidates";
  if (value.length > options.maxCandidates) return "too many candidates";

  const candidates: PrecogCandidate[] = [];
  const seen = new Set<string>();

  for (const [index, raw] of value.entries()) {
    if (!isRecord(raw)) return `candidate ${index} is not an object`;
    // Ids must be the dense prefix the client is supposed to send, so a returned id is
    // always one the server itself put in the request.
    if (raw.id !== `l${index}`) return `candidate ${index} has a forged id`;
    const path = normalizePath(raw.path, options.sendQuery);
    if (path === null) return `candidate ${index} has a bad path`;
    if (!isAllowedPath(path, options.include, options.exclude)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    const position = isRecord(raw.position) ? raw.position : {};
    candidates.push({
      id: raw.id,
      path,
      text: options.sendAnchorText ? str(raw.text, 80) : "",
      inViewport: bool(raw.inViewport),
      position: { x: num(position.x, -10, 20, 0), y: num(position.y, -10, 20, 0) },
      ...(raw.hint === true ? { hint: true } : {}),
    });
  }

  if (candidates.length === 0) return "no allowed candidates";
  return candidates;
}

/** Turns an untrusted body into a state safe to send to Jev, or says why it cannot. */
export function validateState(body: unknown, options: ValidateOptions): Validation {
  if (!isRecord(body)) return { ok: false, reason: "body must be an object" };

  const page = isRecord(body.page) ? body.page : {};
  const path = normalizePath(page.path, options.sendQuery);
  if (path === null) return { ok: false, reason: "bad page path" };

  const candidates = validateCandidates(body.candidates, options);
  if (typeof candidates === "string") return { ok: false, reason: candidates };

  const ids = new Set(candidates.map((candidate) => candidate.id));
  const session = isRecord(body.session) ? body.session : {};
  const pointer = isRecord(body.pointer) ? body.pointer : {};
  const device = isRecord(body.device) ? body.device : {};

  const previousPaths =
    options.sendHistory && Array.isArray(session.previousPaths)
      ? session.previousPaths
          .slice(-MAX_HISTORY)
          .map((value) => normalizePath(value, options.sendQuery))
          .filter((value): value is string => value !== null)
      : [];

  const nearestIds = Array.isArray(pointer.nearestIds)
    ? pointer.nearestIds
        .filter((id): id is string => typeof id === "string" && ids.has(id))
        .slice(0, MAX_NEAREST)
    : [];

  const hoveredId =
    typeof pointer.hoveredId === "string" && ids.has(pointer.hoveredId) ? pointer.hoveredId : null;

  const state: PrecogState = {
    page: {
      path,
      title: str(page.title, MAX_TITLE),
      h1: str(page.h1, MAX_TITLE),
      description: str(page.description, MAX_DESCRIPTION),
    },
    session: {
      previousPaths,
      timeOnPageMs: num(session.timeOnPageMs, 0, 600_000, 0),
      scrollDepth: num(session.scrollDepth, 0, 1),
      scrollVelocity: num(session.scrollVelocity, -20, 20, 1),
    },
    pointer: {
      hasHover: bool(pointer.hasHover),
      x: num(pointer.x, -10, 20, 0),
      y: num(pointer.y, -10, 20, 0),
      vx: num(pointer.vx, -100, 100, 1),
      vy: num(pointer.vy, -100, 100, 1),
      nearestIds,
      hoveredId,
    },
    device: {
      saveData: bool(device.saveData),
      effectiveType: str(device.effectiveType, 16),
    },
    candidates,
  };

  return { ok: true, state };
}

/** Rejects a request that another site made on the visitor's behalf. */
export function isSameSite(headers: {
  origin?: string | null;
  secFetchSite?: string | null;
  host?: string | null;
}): boolean {
  const site = headers.secFetchSite;
  // Chromium and Firefox send this on every fetch. `none` is a direct navigation, not a fetch.
  if (site) return site === "same-origin" || site === "same-site";
  // Without the header, fall back to comparing the Origin with the Host.
  if (!headers.origin) return true;
  try {
    return new URL(headers.origin).host === headers.host;
  } catch {
    return false;
  }
}

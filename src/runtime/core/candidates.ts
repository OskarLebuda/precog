/** Turns raw links into the capped, deduped candidate list sent to the server. Pure. */

import { isAllowedPath } from "./match";
import type { PrecogCandidate, PrecogLink } from "../types";

/** A link as read from the DOM, with nothing the core cannot compute itself. */
export interface RawLink {
  /** The resolved `href` of the anchor. */
  href: string;
  /** Trimmed link text. */
  text: string;
  /** Bounding box in viewport coordinates. */
  rect: { x: number; y: number; width: number; height: number };
  download: boolean;
  target: string;
  /** Value of the `data-precog` attribute. */
  precog: string | null;
}

export interface CandidateContext {
  /** Origin of the current document, for example `https://example.com`. */
  origin: string;
  /** Path of the current page, so it is never its own candidate. */
  currentPath: string;
  viewport: { width: number; height: number };
  maxCandidates: number;
  include?: readonly string[];
  exclude?: readonly string[];
  sendQuery: boolean;
  sendAnchorText: boolean;
}

/** Longest link text sent, so a whole paragraph in an anchor cannot blow up the state. */
const MAX_TEXT = 80;

/**
 * Same-origin path of an href, or `null` when it cannot be speculated:
 * another origin, another protocol, or the current page with only a hash.
 */
export function toPath(href: string, origin: string, currentPath: string, keepQuery: boolean) {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== origin) return null;
  const path = keepQuery ? url.pathname + url.search : url.pathname;
  const current = keepQuery ? currentPath : (currentPath.split("?")[0] ?? currentPath);
  if (path === current) return null;
  return path;
}

/** Position in tenths of the viewport, clamped so far-off links stay in a small range. */
function tenths(value: number, size: number) {
  if (size <= 0) return 0;
  return Math.max(-10, Math.min(20, Math.round((value / size) * 10)));
}

/**
 * Builds the candidate list: same-origin GET targets only, opted-out links removed,
 * deduped by path, then capped with hinted and visible links first.
 */
export function buildCandidates(links: readonly RawLink[], ctx: CandidateContext): PrecogLink[] {
  const seen = new Set<string>();
  const kept: Array<{ link: PrecogLink; hint: boolean; inViewport: boolean; order: number }> = [];

  for (const [order, raw] of links.entries()) {
    if (raw.download || raw.precog === "off") continue;
    const path = toPath(raw.href, ctx.origin, ctx.currentPath, ctx.sendQuery);
    if (path === null) continue;
    if (!isAllowedPath(path, ctx.include, ctx.exclude)) continue;
    if (seen.has(path)) continue;
    seen.add(path);

    const hint = raw.precog === "hint";
    const centreY = raw.rect.y + raw.rect.height / 2;
    const centreX = raw.rect.x + raw.rect.width / 2;
    const inViewport =
      raw.rect.y < ctx.viewport.height &&
      raw.rect.y + raw.rect.height > 0 &&
      raw.rect.x < ctx.viewport.width &&
      raw.rect.x + raw.rect.width > 0;

    kept.push({
      hint,
      inViewport,
      order,
      link: {
        id: "",
        path,
        text: ctx.sendAnchorText ? raw.text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) : "",
        inViewport,
        position: {
          x: tenths(centreX, ctx.viewport.width),
          y: tenths(centreY, ctx.viewport.height),
        },
        ...(hint ? { hint: true } : {}),
        href: new URL(path, ctx.origin).href,
        blank: raw.target === "_blank",
      },
    });
  }

  // Hinted links first, then visible ones, then document order. Ids are assigned after the cap
  // so they always run l0, l1, ... without gaps.
  kept.sort(
    (a, b) =>
      Number(b.hint) - Number(a.hint) ||
      Number(b.inViewport) - Number(a.inViewport) ||
      a.order - b.order,
  );

  return kept
    .slice(0, Math.max(0, ctx.maxCandidates))
    .map(({ link }, index) => ({ ...link, id: `l${index}` }));
}

/** The candidate ids in order, used to spot a stale response. */
export function fingerprint(links: readonly PrecogLink[]): string {
  return links.map((link) => link.path).join("\n");
}

/** Strips the client-only fields, leaving exactly what goes on the wire. */
export function toWire(links: readonly PrecogLink[]): PrecogCandidate[] {
  return links.map(({ href: _href, blank: _blank, ...candidate }) => candidate);
}

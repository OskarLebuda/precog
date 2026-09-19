/**
 * Behavioural signals. The maths is pure and unit tested; the trackers around it only read
 * the DOM and hold a little state.
 */

import type { RawLink } from "./candidates.ts";

export interface Point {
  x: number;
  y: number;
}

export interface PointerSample extends Point {
  /** `performance.now()` when the sample was taken. */
  t: number;
}

export interface Velocity {
  vx: number;
  vy: number;
}

/** A candidate's box, in viewport coordinates. */
export interface Box extends Point {
  id: string;
  width: number;
  height: number;
}

const centre = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** Speed in pixels per second from the oldest and newest sample in the window. */
export function velocityOf(samples: readonly PointerSample[]): Velocity {
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last || last.t <= first.t) return { vx: 0, vy: 0 };
  const seconds = (last.t - first.t) / 1000;
  return { vx: (last.x - first.x) / seconds, vy: (last.y - first.y) / seconds };
}

/**
 * The links the pointer is closing on. Plain distance, divided by how much the pointer is
 * heading that way, so a link straight ahead beats a nearer one behind the cursor.
 */
export function nearestLinks(
  pointer: Point,
  velocity: Velocity,
  boxes: readonly Box[],
  count = 3,
): string[] {
  const speed = Math.hypot(velocity.vx, velocity.vy);
  return boxes
    .map((box) => {
      const target = centre(box);
      const dx = target.x - pointer.x;
      const dy = target.y - pointer.y;
      const distance = Math.hypot(dx, dy) || 1;
      // 1 when the pointer heads straight at the link, 0 when it heads away or stands still.
      const heading =
        speed > 1 ? Math.max(0, (dx * velocity.vx + dy * velocity.vy) / (distance * speed)) : 0;
      return { id: box.id, score: distance / (1 + 2 * heading) };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((entry) => entry.id);
}

/** The box the pointer is inside, if any. */
export function boxUnder(pointer: Point, boxes: readonly Box[]): string | null {
  const hit = boxes.find(
    (box) =>
      pointer.x >= box.x &&
      pointer.x <= box.x + box.width &&
      pointer.y >= box.y &&
      pointer.y <= box.y + box.height,
  );
  return hit ? hit.id : null;
}

/** How far the visitor has read, 0 at the top and 1 at the bottom. */
export function scrollDepthOf(scrollY: number, viewportHeight: number, documentHeight: number) {
  const scrollable = documentHeight - viewportHeight;
  if (scrollable <= 0) return 1;
  return Math.max(0, Math.min(1, scrollY / scrollable));
}

/** Scroll speed in viewport heights per second, signed. */
export function scrollVelocityOf(
  from: { y: number; t: number },
  to: { y: number; t: number },
  viewportHeight: number,
) {
  if (to.t <= from.t || viewportHeight <= 0) return 0;
  return (to.y - from.y) / viewportHeight / ((to.t - from.t) / 1000);
}

// --- DOM readers ---

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/** What the browser says about the connection. Unknown everywhere but Chromium. */
export function readConnection(): { saveData: boolean; effectiveType: string } {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  return {
    saveData: connection?.saveData === true,
    effectiveType: connection?.effectiveType ?? "",
  };
}

/** Every anchor with an href, as the candidate builder wants it. */
export function readLinks(root: ParentNode = document): RawLink[] {
  const links: RawLink[] = [];
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const rect = anchor.getBoundingClientRect();
    // Hidden links have no box and cannot be clicked.
    if (rect.width === 0 && rect.height === 0) continue;
    links.push({
      href: anchor.href,
      text: anchor.textContent ?? "",
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      download: anchor.hasAttribute("download"),
      target: anchor.target,
      precog: anchor.dataset.precog ?? null,
    });
  }
  return links;
}

/** Boxes for the candidates that are still in the document, keyed by candidate id. */
export function readBoxes(elements: ReadonlyMap<string, Element>): Box[] {
  const boxes: Box[] = [];
  for (const [id, element] of elements) {
    if (!element.isConnected) continue;
    const rect = element.getBoundingClientRect();
    boxes.push({ id, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }
  return boxes;
}

"use client";

/**
 * `next/link` with prefetching handed to precog.
 *
 * Next prefetches every `<Link>` that enters the viewport, which on a page of thirty links is
 * thirty RSC payloads. There is no global switch for it, so swapping the import is how you
 * give precog something to narrow.
 *
 * ```tsx
 * import { PrecogLink as Link } from "precog-next";
 * ```
 *
 * Prefetch on hover is still Next's, and still useful: precog covers the time before the
 * cursor arrives, Next covers the moment it lands. Pass `prefetch` explicitly to opt a single
 * link back into the viewport behaviour.
 */

import NextLink from "next/link";
import type { ComponentProps } from "react";

export type PrecogLinkProps = ComponentProps<typeof NextLink>;

export function PrecogLink({ prefetch = false, ...props }: PrecogLinkProps) {
  return <NextLink prefetch={prefetch} {...props} />;
}

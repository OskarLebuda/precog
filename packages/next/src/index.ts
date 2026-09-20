/**
 * The Next.js App Router adapter. The route handler lives in `@precog/next/server`, because it
 * must never be pulled into a client bundle.
 */

export { PrecogProvider, usePrecogContext } from "./provider";
export type { PrecogContextValue, PrecogProviderProps } from "./provider";
export { usePrecog } from "./use-precog";
export type { UsePrecog } from "./use-precog";
export { PrecogLink } from "./link";
export type { PrecogLinkProps } from "./link";
export { PrecogOverlay } from "./overlay";
export type { PrecogOverlayProps } from "./overlay";
export { defaults, withDefaults, DEFAULT_ENDPOINT } from "./options";
export type { PrecogOptions } from "./options";
export type * from "@precog/core";

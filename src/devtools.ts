import { addCustomTab } from "@nuxt/devtools-kit";
import type { Nuxt } from "@nuxt/schema";

export const DEVTOOLS_ROUTE = "/_precog/devtools";

/**
 * A tab showing the same numbers as the overlay, plus a timeline of decisions. It renders in
 * its own iframe and receives updates over a BroadcastChannel that the overlay plugin posts to.
 */
export function setupDevtools(nuxt: Nuxt) {
  nuxt.hook("devtools:initialized", () => {
    addCustomTab({
      name: "precog",
      title: "precog",
      icon: "carbon:crossroads",
      view: { type: "iframe", src: DEVTOOLS_ROUTE },
    });
  });
}

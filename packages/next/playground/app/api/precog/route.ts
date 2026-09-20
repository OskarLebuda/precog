import { createPrecogHandler } from "next-precog/server";

export const POST = createPrecogHandler({
  // The demo's stand-in spreads probability thinly, so the bars sit below the defaults.
  exclude: ["/logout", "/api/**", "/cart/**"],
});

import { createPrecogHandler } from "precog-next/server";

export const POST = createPrecogHandler({
  // The demo's stand-in spreads probability thinly, so the bars sit below the defaults.
  exclude: ["/logout", "/api/**", "/cart/**"],
});

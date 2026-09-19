import { DOC_SLUGS } from "./shared/docs";

export default defineNuxtConfig({
  modules: ["nuxt-precog"],
  devtools: {
    enabled: true,
    // Lets the e2e suite drive DevTools from an automated browser.
    disableAuthorization: process.env.PRECOG_DEVTOOLS_OPEN === "1",
  },
  compatibilityDate: "2026-09-19",
  // Only the docs section is prerendered, so its pages have a payload to warm up. Crawling
  // is off: it would follow the header links and turn the whole demo into static files.
  routeRules: { "/docs/**": { prerender: true } },
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: ["/docs", ...DOC_SLUGS.map((slug) => `/docs/${slug}`)],
    },
  },
  experimental: { payloadExtraction: true },
  precog: {
    mode: "auto",
    // The demo's mock spreads probability thinly over many links, so the bars are lower
    // than the defaults expect.
    thresholds: { prefetch: 0.06, prerender: 0.25 },
    // `PRECOG_OVERLAY=dev` builds the playground the way a real production build looks.
    overlay: process.env.PRECOG_OVERLAY === "dev" ? "dev" : true,
    takeOverNuxtLinkPrefetch: true,
  },
});

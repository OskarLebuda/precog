export default defineNuxtConfig({
  modules: ["nuxt-precog"],
  devtools: { enabled: true },
  compatibilityDate: "2026-09-19",
  // The docs section is prerendered so its pages have a payload to warm up.
  routeRules: { "/docs/**": { prerender: true } },
  nitro: { prerender: { crawlLinks: true, routes: ["/docs"] } },
  experimental: { payloadExtraction: true },
  precog: {
    mode: "auto",
    // The demo's mock spreads probability thinly over many links, so the bars are lower
    // than the defaults expect.
    thresholds: { prefetch: 0.06, prerender: 0.25 },
    overlay: true,
    takeOverNuxtLinkPrefetch: true,
  },
});

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** The DevTools tab. Generated to `dist/client` and served by the module over sirv. */
export default defineNuxtConfig({
  ssr: false,
  app: {
    baseURL: "/__precog",
    head: { title: "precog" },
  },
  nitro: {
    output: { publicDir: resolve(here, "../dist/client") },
  },
  vite: {
    server: {
      // `client:dev` is proxied by the host, so point HMR at the real port.
      hmr: { clientPort: Number(process.env.PORT || 3300) },
    },
  },
  devtools: { enabled: false },
  compatibilityDate: "2026-09-19",
});

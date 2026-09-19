import { existsSync } from "node:fs";
import { addCustomTab } from "@nuxt/devtools-kit";
import type { Resolver } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";

/** Where the tab's own app is served from inside the host's dev server. */
const DEVTOOLS_UI_ROUTE = "/__precog";
/** Port `pnpm client:dev` listens on while the tab itself is being worked on. */
const DEVTOOLS_UI_LOCAL_PORT = 3300;

/**
 * Registers the DevTools tab and serves its client.
 *
 * The client is a small Nuxt app under `client/`, generated into `dist/client` on publish.
 * When that build is present it is served with sirv; otherwise the host proxies to the
 * client's own dev server, which is what `pnpm client:dev` starts.
 */
export function setupDevtools(nuxt: Nuxt, resolver: Resolver) {
  const clientPath = resolver.resolve("./client");

  if (existsSync(clientPath)) {
    nuxt.hook("vite:serverCreated", async (server) => {
      const sirv = await import("sirv").then((module) => module.default || module);
      server.middlewares.use(DEVTOOLS_UI_ROUTE, sirv(clientPath, { dev: true, single: true }));
    });
  } else {
    nuxt.hook("vite:extendConfig", (config) => {
      // Vite types the resolved config as read-only, but this hook exists to change it.
      const server = ((config as { server?: Record<string, unknown> }).server ||= {});
      const proxy = ((server as { proxy?: Record<string, unknown> }).proxy ||= {});
      proxy[DEVTOOLS_UI_ROUTE] = {
        target: `http://localhost:${DEVTOOLS_UI_LOCAL_PORT}${DEVTOOLS_UI_ROUTE}`,
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path: string) => path.replace(DEVTOOLS_UI_ROUTE, ""),
      };
    });
  }

  addCustomTab({
    name: "precog",
    title: "precog",
    icon: "carbon:crossroads",
    view: { type: "iframe", src: DEVTOOLS_UI_ROUTE },
  });
}

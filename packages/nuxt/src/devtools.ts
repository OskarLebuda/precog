import { existsSync } from "node:fs";
import { addCustomTab } from "@nuxt/devtools-kit";
import type { Resolver } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";

/** Where the tab's own app is served from inside the host's dev server. */
const DEVTOOLS_UI_ROUTE = "/__precog";
/** Port `pnpm client:dev` listens on while the tab itself is being worked on. */
const DEVTOOLS_UI_LOCAL_PORT = 3300;

/**
 * Finds the built tab client.
 *
 * `./client` is where it sits in a published package, next to `dist/module.mjs`. During local
 * development the module is loaded as a jiti stub, so `import.meta.url` points at `src/` and
 * the build is one level up in `dist/`. Both are checked because both are normal.
 */
function findClient(resolver: Resolver): string | undefined {
  return [resolver.resolve("./client"), resolver.resolve("../dist/client")].find((path) =>
    existsSync(path),
  );
}

/**
 * Registers the DevTools tab and serves its client.
 *
 * The client is a small Nuxt app under `client/`, generated into `dist/client`. When that
 * build is there it is served with sirv. Otherwise the host proxies to the client's own dev
 * server, which is what `pnpm client:dev` starts, and which `PRECOG_DEVTOOLS_LOCAL=1` asks
 * for explicitly while the tab is being worked on.
 */
export function setupDevtools(nuxt: Nuxt, resolver: Resolver) {
  const local = process.env.PRECOG_DEVTOOLS_LOCAL === "1";
  const clientPath = local ? undefined : findClient(resolver);

  if (clientPath) {
    nuxt.hook("vite:serverCreated", async (server) => {
      const sirv = await import("sirv").then((module) => module.default || module);
      server.middlewares.use(DEVTOOLS_UI_ROUTE, sirv(clientPath, { dev: true, single: true }));
    });
  } else {
    if (!local) {
      // Without this the tab is a blank page and the terminal only says ECONNREFUSED.
      console.warn(
        `[precog] the DevTools tab client is not built, so ${DEVTOOLS_UI_ROUTE} is proxied to ` +
          `port ${DEVTOOLS_UI_LOCAL_PORT}. Run \`pnpm client:build\` once, or \`pnpm client:dev\` ` +
          `to work on the tab itself.`,
      );
    }
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

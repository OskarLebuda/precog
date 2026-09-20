import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PRECOG_E2E_PORT ?? 3199);
const DEV_PORT = Number(process.env.PRECOG_E2E_DEV_PORT ?? 3198);
const baseURL = `http://127.0.0.1:${PORT}`;
// `nuxt dev` binds to localhost, not 127.0.0.1, so the health check has to match.
const devURL = `http://localhost:${DEV_PORT}`;

// The stand-in TypeSafe API that `e2e/global-setup.ts` starts.
const MOCK_URL = "http://127.0.0.1:4571";

const chrome = { ...devices["Desktop Chrome"], channel: "chrome" as const };

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL, trace: "retain-on-failure" },
  // Speculation rules are Chromium only, which is the point of the effector. Installed
  // Chrome is used rather than the bundled build, so the rules behave as they ship.
  projects: [
    {
      name: "chrome",
      use: chrome,
      testIgnore: /devtools\.spec\.ts/,
    },
    {
      // DevTools only exists in a dev server, so this project gets its own one.
      name: "devtools",
      use: { ...chrome, baseURL: devURL },
      testMatch: /devtools\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: "node playground/.output/server/index.mjs",
      url: baseURL,
      env: {
        PORT: String(PORT),
        NITRO_PORT: String(PORT),
        // A key the tests then look for in everything the server sends to the browser.
        NUXT_PRECOG_API_KEY: "e2e-secret-key",
        TYPESAFE_BASE_URL: MOCK_URL,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm exec nuxt dev playground --port ${DEV_PORT}`,
      url: devURL,
      env: {
        // Lets an automated browser drive DevTools without the authorization prompt.
        PRECOG_DEVTOOLS_OPEN: "1",
        NUXT_PRECOG_API_KEY: "e2e-secret-key",
        TYPESAFE_BASE_URL: MOCK_URL,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});

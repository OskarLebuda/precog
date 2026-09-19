import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PRECOG_E2E_PORT ?? 3199);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL, trace: "retain-on-failure" },
  // Speculation rules are Chromium only, which is the point of the effector. Installed
  // Chrome is used rather than the bundled build, so the rules behave as they ship.
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: `node playground/.output/server/index.mjs`,
    url: baseURL,
    env: {
      PORT: String(PORT),
      NITRO_PORT: String(PORT),
      // A key the tests then look for in everything the server sends to the browser.
      NUXT_PRECOG_API_KEY: "e2e-secret-key",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

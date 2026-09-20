import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PRECOG_NEXT_E2E_PORT ?? 3401);
const baseURL = `http://127.0.0.1:${PORT}`;
// The stand-in TypeSafe API that `e2e/global-setup.ts` starts.
const MOCK_URL = "http://127.0.0.1:4573";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL, trace: "retain-on-failure" },
  // Speculation rules are Chromium only, which is the point of one of the two effectors.
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: "pnpm start",
    cwd: "playground",
    url: baseURL,
    env: {
      PORT: String(PORT),
      // A key the tests then look for in everything the server sends to the browser.
      TYPESAFE_API_KEY: "e2e-secret-key",
      TYPESAFE_BASE_URL: MOCK_URL,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

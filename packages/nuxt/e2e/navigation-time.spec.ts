import { expect, test, type Page } from "@playwright/test";
import { waitForRules } from "./helpers";

/** A slow link, so one saved round trip is something a stopwatch can see. */
const CONDITIONS = {
  offline: false,
  latency: 400,
  downloadThroughput: (750 * 1024) / 8,
  uploadThroughput: (250 * 1024) / 8,
};

async function throttle(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.emulateNetworkConditions", CONDITIONS);
  return session;
}

/** Milliseconds from clicking a link to its page being on screen. */
async function timeNavigation(page: Page, name: string) {
  const started = Date.now();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return Date.now() - started;
}

test("a warmed navigation is faster than a cold one", async ({ page }) => {
  await throttle(page);
  const target = "Getting started";

  await page.goto("/docs?precog=off");
  await page.waitForTimeout(2500);
  const cold = await timeNavigation(page, target);

  await page.goto("/docs");
  await waitForRules(page);
  await page.waitForTimeout(2500);
  const warm = await timeNavigation(page, target);

  console.log(`cold ${cold} ms, warm ${warm} ms`);
  // A saved round trip on a 400 ms link is not subtle; a small margin would only flake.
  expect(warm).toBeLessThan(cold * 0.6);
});

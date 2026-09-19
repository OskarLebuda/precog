import { expect, test, type Page } from "@playwright/test";
import { waitForRules } from "./helpers.ts";

/** Payload fetches tell us exactly which routes were warmed, one per route. */
function watchPayloads(page: Page, own: string) {
  const paths = new Set<string>();
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    // The page loads its own payload; only the extra ones were warmed by the module.
    if (pathname.endsWith("/_payload.json") && pathname !== `${own}/_payload.json`) {
      paths.add(pathname);
    }
  });
  return paths;
}

test("warms only the top ranked routes, not every visible link", async ({ page }) => {
  const warmed = watchPayloads(page, "/docs");
  await page.goto("/docs");
  const links = await page.locator("main ul a").count();
  expect(links).toBeGreaterThanOrEqual(12);

  await waitForRules(page);
  await page.waitForTimeout(1500);

  expect(warmed.size).toBeGreaterThan(0);
  // The budget is three prefetches plus one prerender.
  expect(warmed.size).toBeLessThanOrEqual(4);
  expect(warmed.size).toBeLessThan(links);
});

test("warms nothing when the module is switched off", async ({ page }) => {
  const warmed = watchPayloads(page, "/docs");
  await page.goto("/docs?precog=off");
  await page.waitForTimeout(3000);
  expect([...warmed]).toEqual([]);
});

test("warms exactly the routes the policy chose", async ({ page }) => {
  const warmed = watchPayloads(page, "/docs");
  await page.goto("/docs");
  await waitForRules(page);
  await page.waitForTimeout(1500);

  const chosen = await page.evaluate(() => {
    const plan = (
      window as unknown as { __precogPlan?: { prefetch: string[]; prerender: string[] } }
    ).__precogPlan;
    return plan ? [...plan.prerender, ...plan.prefetch] : [];
  });
  expect(chosen.length).toBeGreaterThan(0);
  expect(warmed.size).toBe(chosen.length);
  for (const url of chosen) {
    expect([...warmed]).toContain(`${new URL(url).pathname}/_payload.json`);
  }
});

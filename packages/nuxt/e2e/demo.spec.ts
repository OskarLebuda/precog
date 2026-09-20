import { expect, test } from "@playwright/test";
import { ruleSet, waitForRules, watchPredictions } from "./helpers";

const panel = "aside.panel";

test("the control panel switches the three arms and they stick across navigation", async ({
  page,
}) => {
  await page.goto("/docs");
  await waitForRules(page);

  await page.locator(`${panel} button`, { hasText: "off" }).click();
  await page.waitForURL("**/docs");
  await expect(page.locator(`${panel} button[aria-pressed="true"]`)).toHaveText("off");
  expect(await ruleSet(page)).toBe(null);

  // A client navigation must not quietly bring the module back.
  const requests = watchPredictions(page);
  await page.getByRole("link", { name: "Blog" }).click();
  await page.waitForTimeout(2500);
  expect(await ruleSet(page)).toBe(null);
  expect(requests).toHaveLength(0);
});

test("the native arm uses the browser's own document rules", async ({ page }) => {
  await page.goto("/docs");
  await page.locator(`${panel} button`, { hasText: "native" }).click();
  await page.waitForURL("**/docs");

  expect(await ruleSet(page)).toBe(null);
  const native = await page.evaluate(
    () =>
      document.querySelector<HTMLScriptElement>('script[type="speculationrules"][data-native]')
        ?.textContent ?? "",
  );
  expect(native).toContain('"eagerness":"moderate"');
  expect(native).toContain('"source":"document"');
});

test("the server delay slider actually delays", async ({ page }) => {
  await page.goto("/blog");
  const quick = await time(page, "/blog");
  await page.context().addCookies([{ name: "precog_delay", value: "500", url: page.url() }]);
  const slow = await time(page, "/blog");
  expect(slow - quick).toBeGreaterThan(300);
});

test("the overlay clears its badges when the page changes", async ({ page }) => {
  await page.goto("/docs?precog=debug");
  await waitForRules(page);
  await expect(page.locator(".precog-badge").first()).toBeVisible();

  await page.getByRole("link", { name: "Options", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Options", level: 1 })).toBeVisible();
  // The old page's badges point at links that are gone, so they go first. New ones arrive
  // with the next prediction.
  await expect(page.locator(".precog-badge")).toHaveCount(0, { timeout: 1000 });
  await expect(page.locator(".precog-badge").first()).toBeVisible();
});

test("the experimental document navigation mode leaves the router out of it", async ({ page }) => {
  await page.goto("/docs");
  await waitForRules(page);
  await page.evaluate(() => {
    (
      window as unknown as { __precog: { options: { documentNavigation: boolean } } }
    ).__precog.options.documentNavigation = true;
  });

  const target = page.getByRole("link", { name: "Options", exact: true });
  await target.hover();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __precogPlan?: { prerender: string[] } }).__precogPlan?.prerender
            ?.length ?? 0,
      ),
    )
    .toBeGreaterThan(0);

  const documents: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents.push(request.url());
  });

  await Promise.all([page.waitForURL("**/docs/options"), target.click()]);
  await expect(page.getByRole("heading", { name: "Options", level: 1 })).toBeVisible();

  // The router was bypassed: the browser fetched or activated a document of its own.
  expect(documents.some((url) => url.endsWith("/docs/options"))).toBe(true);

  // Whether that document came out of the prerender is up to the browser, and Chrome will
  // not always have finished one in the time a test gives it.
  const delivery = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming & {
      activationStart?: number;
      deliveryType?: string;
    };
    return { activationStart: entry.activationStart ?? 0, deliveryType: entry.deliveryType ?? "" };
  });
  console.log(`document navigation delivery: ${JSON.stringify(delivery)}`);
});

async function time(page: import("@playwright/test").Page, path: string) {
  return page.evaluate(async (target) => {
    const started = performance.now();
    await fetch(target, { cache: "no-store" });
    return performance.now() - started;
  }, path);
}

import { expect, test, type Frame, type Page } from "@playwright/test";

const TAB_ROUTE = "/__nuxt_devtools__/client/modules/custom-precog";
const CLIENT_URL = "/__precog";

const devtoolsFrame = (page: Page) =>
  page.frames().find((frame) => frame.url().includes("__nuxt_devtools__"));

const tabFrame = (page: Page) => page.frames().find((frame) => frame.url().endsWith(CLIENT_URL));

/**
 * Opens DevTools in the page and puts it on the precog tab. The tab is registered under
 * "modules" but is not pinned to the sidebar, so it is reached by its route. DevTools
 * navigates its own iframe, which detaches frames, hence the polling rather than one wait.
 */
async function openTab(page: Page): Promise<Frame> {
  await page.keyboard.press("Shift+Alt+D");

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const devtools = devtoolsFrame(page);
    if (devtools) {
      const welcome = devtools.locator(':text-is("Get Started")').first();
      if (await welcome.count().catch(() => 0)) {
        await welcome.click({ force: true }).catch(() => {});
      } else if (!devtools.url().includes("custom-precog")) {
        await devtools
          .evaluate((route) => window.location.assign(route), TAB_ROUTE)
          .catch(() => {});
      }
    }

    const tab = tabFrame(page);
    if (
      tab &&
      (await tab
        .locator("h1")
        .count()
        .catch(() => 0))
    )
      return tab;

    await page.waitForTimeout(400);
  }
  throw new Error("the precog DevTools tab did not open");
}

const hasRules = (page: Page) =>
  page.evaluate(
    () => document.querySelector('script[type="speculationrules"][data-precog]') !== null,
  );

test("registers a tab whose client reads the module from the host page", async ({ page }) => {
  await page.goto("/docs");
  await page.waitForLoadState("networkidle");

  const tab = await openTab(page);

  await expect(tab.locator("h1")).toHaveText("precog");
  // It found the running module in the host page, not just its own shell.
  await expect(tab.locator("header p")).toContainText("watching");
  await expect(tab.locator("dl")).toContainText("jev latency");
  await expect(tab.locator("section", { hasText: "Speculating now" })).toContainText("/docs/");
  await expect(tab.locator("ul.bars li").first()).toContainText("%");
});

test("its controls drive the module in the host page", async ({ page }) => {
  await page.goto("/docs");
  await page.waitForLoadState("networkidle");
  const tab = await openTab(page);
  await expect.poll(() => hasRules(page), { timeout: 20_000 }).toBe(true);

  await tab.locator('button:text-is("Pause")').click();
  await expect(tab.locator("header p")).toContainText("paused");
  await expect.poll(() => hasRules(page)).toBe(false);

  await tab.locator('button:text-is("Resume")').click();
  await expect(tab.locator("header p")).toContainText("watching");
  await expect.poll(() => hasRules(page), { timeout: 20_000 }).toBe(true);
});

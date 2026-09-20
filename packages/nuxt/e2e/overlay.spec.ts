import { expect, test } from "@playwright/test";
import { waitForRules } from "./helpers";

const hud = "aside.precog-hud";
const badge = ".precog-badge";

test("opens with ?precog=debug and shows badges and a hud", async ({ page }) => {
  await page.goto("/docs?precog=debug");
  await waitForRules(page);

  await expect(page.locator(hud)).toBeVisible();
  await expect(page.locator(badge).first()).toBeVisible();
  await expect(page.locator(hud)).toContainText("jev latency");
  await expect(page.locator(hud)).toContainText("/docs/getting-started");

  const outlined = page.locator(`${badge}[data-action~="top"]`);
  await expect(outlined).toHaveCount(1);
});

test("stays hidden until Shift+P", async ({ page }) => {
  await page.goto("/docs");
  await waitForRules(page);
  await expect(page.locator(hud)).toHaveCount(0);

  await page.keyboard.press("Shift+P");
  await expect(page.locator(hud)).toBeVisible();

  await page.keyboard.press("Shift+P");
  await expect(page.locator(hud)).toHaveCount(0);
});

test("does not move the page", async ({ page }) => {
  await page.goto("/docs");
  await waitForRules(page);

  const before = await page.locator("main h1").boundingBox();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);

  await page.keyboard.press("Shift+P");
  await expect(page.locator(hud)).toBeVisible();

  expect(await page.locator("main h1").boundingBox()).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
});

test("says plainly that the cost is unknown without prices", async ({ page }) => {
  await page.goto("/docs?precog=debug");
  await waitForRules(page);
  await expect(page.locator(hud)).toContainText("no prices configured");
});

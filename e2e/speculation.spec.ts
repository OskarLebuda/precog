import { expect, test } from "@playwright/test";
import {
  emulateSaveData,
  emulateSlowConnection,
  hideTab,
  ruleSet,
  speculatedUrls,
  waitForRules,
  watchPredictions,
} from "./helpers.ts";

test("writes one tagged speculation rules script for the top links", async ({ page }) => {
  await page.goto("/");
  await waitForRules(page);

  const rules = (await ruleSet(page)) as {
    prefetch?: Array<{ source: string; eagerness: string; tag: string; urls: string[] }>;
  };
  const rule = rules.prefetch?.[0] ?? (rules as never as { prerender: never[] }).prerender[0];
  expect(rule).toMatchObject({ source: "list", eagerness: "immediate", tag: "precog" });

  await expect
    .poll(() => page.locator('script[type="speculationrules"][data-precog]').count())
    .toBe(1);

  const urls = await speculatedUrls(page);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.length).toBeLessThanOrEqual(4);
  for (const url of urls) expect(new URL(url).origin).toBe(new URL(page.url()).origin);
});

test("never speculates a denied or opted-out link", async ({ page }) => {
  await page.goto("/");
  await waitForRules(page);
  const urls = await speculatedUrls(page);
  expect(urls.some((url) => url.includes("/logout"))).toBe(false);
  expect(urls.some((url) => url.includes("/cart/"))).toBe(false);
});

test("updates the rules when the cursor heads for another link", async ({ page }) => {
  await page.goto("/");
  await waitForRules(page);

  const first = page.getByRole("link", { name: "Post number 1", exact: true });
  await first.hover();
  await expect.poll(() => speculatedUrls(page)).toContain(`${new URL(page.url()).origin}/blog/1`);

  const other = page.getByRole("link", { name: "Post number 9", exact: true });
  await other.hover();
  await expect
    .poll(() => speculatedUrls(page), { timeout: 15_000 })
    .toContain(`${new URL(page.url()).origin}/blog/9`);
});

test("updates the rules after a scroll", async ({ page }) => {
  await page.goto("/blog");
  await waitForRules(page);
  const before = await speculatedUrls(page);

  await page.mouse.move(400, 200);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.mouse.move(400, 500);

  await expect.poll(() => speculatedUrls(page), { timeout: 15_000 }).not.toEqual(before);
});

test("does nothing on a page that opted out", async ({ page }) => {
  const requests = watchPredictions(page);
  await page.goto("/quiet");
  await page.waitForTimeout(2500);
  expect(await ruleSet(page)).toBe(null);
  expect(requests).toHaveLength(0);
});

test("removes its rules when navigating onto an opted-out page", async ({ page }) => {
  await page.goto("/");
  await waitForRules(page);
  await page.getByRole("link", { name: "Quiet page" }).click();
  await expect.poll(() => ruleSet(page)).toBe(null);
});

test("does nothing at all with ?precog=off", async ({ page }) => {
  const requests = watchPredictions(page);
  await page.goto("/?precog=off");
  await page.waitForTimeout(2500);
  expect(await ruleSet(page)).toBe(null);
  expect(requests).toHaveLength(0);
});

test("stays quiet when the visitor asked to save data", async ({ page }) => {
  await emulateSaveData(page);
  const requests = watchPredictions(page);
  await page.goto("/");
  await page.waitForTimeout(2500);
  expect(requests).toHaveLength(0);
  expect(await ruleSet(page)).toBe(null);
});

test("stays quiet on a slow connection", async ({ page }) => {
  await emulateSlowConnection(page);
  const requests = watchPredictions(page);
  await page.goto("/");
  await page.waitForTimeout(2500);
  expect(requests).toHaveLength(0);
});

test("stops predicting while the tab is in the background", async ({ page }) => {
  await page.goto("/");
  await waitForRules(page);
  const requests = watchPredictions(page);
  await hideTab(page);
  await page.mouse.move(400, 300);
  await page.mouse.move(400, 500);
  await page.waitForTimeout(3000);
  expect(requests).toHaveLength(0);
});

test("sends ids and paths but never a full url", async ({ page }) => {
  const bodies: unknown[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/_precog/predict")) bodies.push(request.postDataJSON());
  });
  await page.goto("/");
  await waitForRules(page);

  const body = bodies[0] as {
    candidates: Array<{ id: string; path: string; href?: string }>;
    page: { path: string };
  };
  expect(body.page.path).toBe("/");
  expect(body.candidates.length).toBeGreaterThan(0);
  for (const [index, candidate] of body.candidates.entries()) {
    expect(candidate.id).toBe(`l${index}`);
    expect(candidate.path.startsWith("/")).toBe(true);
    expect(candidate).not.toHaveProperty("href");
  }
});

test("the api key never reaches the browser", async ({ page }) => {
  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() === "document" || response.url().includes("/_nuxt/")) {
      bodies.push(await response.text().catch(() => ""));
    }
  });
  await page.goto("/");
  await waitForRules(page);

  for (const body of bodies) expect(body).not.toContain("e2e-secret-key");
  const config = await page.evaluate(() =>
    JSON.stringify((window as unknown as { __NUXT__?: unknown }).__NUXT__ ?? {}),
  );
  expect(config).not.toContain("e2e-secret-key");
  expect(config).not.toContain("apiKey");
});

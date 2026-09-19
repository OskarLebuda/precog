import { expect, test } from "@playwright/test";
import { speculatedUrls, waitForRules } from "./helpers.ts";

interface Seen {
  url: string;
  purpose: string;
  type: string;
}

/**
 * The question the whole design hangs on: does a document speculation rule do anything for a
 * NuxtLink click? This test records what the browser actually fetches, so the answer is
 * measured rather than assumed. See `docs/decisions.md`.
 */
test("a speculated document is fetched, and a NuxtLink click does not use it", async ({ page }) => {
  const seen: Seen[] = [];
  page.on("request", (request) => {
    seen.push({
      url: request.url(),
      purpose: request.headers()["sec-purpose"] ?? "",
      type: request.resourceType(),
    });
  });

  await page.goto("/");
  await waitForRules(page);

  const target = page.getByRole("link", { name: "Post number 1", exact: true });
  await target.hover();
  await expect.poll(() => speculatedUrls(page)).toContain(`${new URL(page.url()).origin}/blog/1`);

  // The browser speculatively fetches the document itself.
  await expect
    .poll(() => seen.filter((r) => r.url.endsWith("/blog/1") && r.purpose.includes("prefetch")))
    .not.toHaveLength(0);

  seen.length = 0;
  await target.click();
  await expect(page.getByRole("heading", { name: "Post number 1" })).toBeVisible();

  // The client router took over. It never asks for the document, so the speculated copy of
  // it is not what made the navigation fast.
  expect(seen.filter((r) => r.type === "document")).toHaveLength(0);
});

test("a full document navigation does use the speculated load", async ({ page }) => {
  await page.goto("/");
  await waitForRules(page);
  const origin = new URL(page.url()).origin;

  const target = page.getByRole("link", { name: "Post number 1", exact: true });
  await target.hover();
  await expect.poll(() => speculatedUrls(page)).toContain(`${origin}/blog/1`);

  // Leaving the router out of it is what a speculation rule is for.
  await Promise.all([
    page.waitForURL("**/blog/1"),
    page.evaluate(() => {
      const anchor = [...document.querySelectorAll("a")].find((a) => a.pathname === "/blog/1");
      location.href = anchor!.href;
    }),
  ]);
  await page.waitForLoadState("load");

  const delivery = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming & {
      deliveryType?: string;
      activationStart?: number;
    };
    return { deliveryType: entry.deliveryType ?? "", activationStart: entry.activationStart ?? 0 };
  });
  expect(delivery.deliveryType === "navigational-prefetch" || delivery.activationStart > 0).toBe(
    true,
  );
});

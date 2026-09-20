import { expect, test, type Page } from "@playwright/test";

const rules = (page: Page) =>
  page.evaluate(() => {
    const script = document.querySelector<HTMLScriptElement>(
      'script[type="speculationrules"][data-precog]',
    );
    return script ? (JSON.parse(script.textContent ?? "{}") as Record<string, unknown>) : null;
  });

async function speculated(page: Page) {
  const set = (await rules(page)) as {
    prerender?: Array<{ urls?: string[] }>;
    prefetch?: Array<{ urls?: string[] }>;
  } | null;
  if (!set) return [];
  return [...(set.prerender ?? []), ...(set.prefetch ?? [])].flatMap((rule) => rule.urls ?? []);
}

const waitForRules = (page: Page) =>
  page.waitForFunction(
    () => document.querySelector('script[type="speculationrules"][data-precog]') !== null,
  );

/** RSC payload fetches, which is what `router.prefetch` warms. */
function watchPrefetches(page: Page) {
  const paths = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.searchParams.has("_rsc")) paths.add(url.pathname);
  });
  return paths;
}

test("writes speculation rules for the links the model picked", async ({ page }) => {
  await page.goto("/docs");
  await waitForRules(page);

  const set = (await rules(page)) as { prefetch?: Array<Record<string, unknown>> };
  const rule = set.prefetch?.[0] ?? (set as never as { prerender: never[] }).prerender[0];
  expect(rule).toMatchObject({ source: "list", eagerness: "immediate", tag: "precog" });

  const urls = await speculated(page);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.length).toBeLessThanOrEqual(4);
  for (const url of urls) expect(new URL(url).origin).toBe(new URL(page.url()).origin);
});

test("warms only the routes it chose, not every link on the page", async ({ page }) => {
  const warmed = watchPrefetches(page);
  await page.goto("/docs");
  const links = await page.locator("main ul a").count();
  expect(links).toBeGreaterThanOrEqual(12);

  await waitForRules(page);
  await page.waitForTimeout(1500);

  // PrecogLink turns off Next's viewport prefetch, so what is left is the module's choice.
  const chosen = [...warmed].filter((path) => path.startsWith("/docs/"));
  expect(chosen.length).toBeGreaterThan(0);
  expect(chosen.length).toBeLessThanOrEqual(4);
  expect(chosen.length).toBeLessThan(links);
});

test("follows the cursor", async ({ page }) => {
  await page.goto("/docs");
  await waitForRules(page);

  const origin = new URL(page.url()).origin;
  await page.getByRole("link", { name: "Policy", exact: true }).hover();
  await expect.poll(() => speculated(page), { timeout: 20_000 }).toContain(`${origin}/docs/policy`);

  await page.getByRole("link", { name: "Faq", exact: true }).hover();
  await expect.poll(() => speculated(page), { timeout: 20_000 }).toContain(`${origin}/docs/faq`);
});

test("the overlay opens and does not move the page", async ({ page }) => {
  await page.goto("/docs");
  await waitForRules(page);

  const before = await page.locator("main h1").boundingBox();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);

  await page.keyboard.press("Shift+P");
  await expect(page.locator("aside.precog-hud")).toBeVisible();
  await expect(page.locator(".precog-badge").first()).toBeVisible();
  await expect(page.locator("aside.precog-hud")).toContainText("jev latency");

  expect(await page.locator("main h1").boundingBox()).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
});

test("does nothing at all with ?precog=off", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/precog")) calls.push(r.url());
  });
  await page.goto("/docs?precog=off");
  await page.waitForTimeout(3000);
  expect(await rules(page)).toBe(null);
  expect(calls).toHaveLength(0);
});

test("the api key never reaches the browser", async ({ page }) => {
  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() === "document" || response.url().includes("/_next/")) {
      bodies.push(await response.text().catch(() => ""));
    }
  });
  await page.goto("/docs");
  await waitForRules(page);
  for (const body of bodies) expect(body).not.toContain("e2e-secret-key");
});

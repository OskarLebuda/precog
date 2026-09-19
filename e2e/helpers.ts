import type { Page, Request } from "@playwright/test";

export const ENDPOINT = "/_precog/predict";

/** The rule set the module owns, parsed, or null when it is not in the document. */
export async function ruleSet(page: Page) {
  return page.evaluate(() => {
    const script = document.querySelector<HTMLScriptElement>(
      'script[type="speculationrules"][data-precog]',
    );
    return script ? (JSON.parse(script.textContent ?? "{}") as Record<string, unknown>) : null;
  });
}

/** Every URL the module asked the browser to speculate, in one flat list. */
export async function speculatedUrls(page: Page): Promise<string[]> {
  const rules = (await ruleSet(page)) as {
    prerender?: Array<{ urls?: string[] }>;
    prefetch?: Array<{ urls?: string[] }>;
  } | null;
  if (!rules) return [];
  return [...(rules.prerender ?? []), ...(rules.prefetch ?? [])].flatMap((rule) => rule.urls ?? []);
}

/** Collects every prediction request the page makes. */
export function watchPredictions(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (request.url().includes(ENDPOINT)) requests.push(request);
  });
  return requests;
}

/** Pretends the connection asks for less data. */
export async function emulateSaveData(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true, effectiveType: "4g" },
    });
  });
}

/** Pretends the connection is too slow to be worth speculating on. */
export async function emulateSlowConnection(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: false, effectiveType: "slow-2g" },
    });
  });
}

/** Puts the tab in the background from the page's point of view. */
export async function hideTab(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

export async function waitForRules(page: Page) {
  await page.waitForFunction(
    () => document.querySelector('script[type="speculationrules"][data-precog]') !== null,
  );
}

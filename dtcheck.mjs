import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/docs", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.keyboard.press("Shift+Alt+D");
await page.waitForTimeout(3000);
const dt = page.frames().find((f) => f.url().includes("__nuxt_devtools__"));
const gs = dt.locator(':text-is("Get Started")').first();
if (await gs.count()) {
  await gs.click({ force: true });
  await page.waitForTimeout(3500);
}
const html = await dt.locator("body").innerHTML();
console.log("HAS precog in html:", html.includes("precog"));
console.log("HAS __precog:", html.includes("__precog"));
const links = await dt
  .locator("a")
  .evaluateAll((els) =>
    els.map((e) => `${e.getAttribute("href")} :: ${e.textContent.trim().slice(0, 30)}`),
  );
console.log("LINKS:\n" + links.join("\n"));
await browser.close();

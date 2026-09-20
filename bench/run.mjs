/**
 * Compares three arms over scripted synthetic visitors:
 *
 *   off      nothing warms links
 *   native   the browser's own document rules, eagerness moderate
 *   precog   this module
 *
 * The visitors are synthetic. Their click model is a guess, not measured behaviour, so treat
 * hit rate and accuracy as "how well the module does against this model", not as a claim
 * about real people. Timings are real: real Chrome, a real build, a throttled link.
 *
 * Needs a key: the playground has no stand-in, so every arm measures the real service.
 * Usage: pnpm --filter @precog/nuxt dev:build && TYPESAFE_API_KEY=... pnpm bench
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { approach, pick, read, rng } from "./visitor.mjs";

const PORT = Number(process.env.BENCH_PORT ?? 3220);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "bench/results";
const ARMS = ["off", "native", "precog"];
const SESSIONS = Number(process.env.BENCH_SESSIONS ?? 8);
const HOPS = Number(process.env.BENCH_HOPS ?? 6);
const START = "/docs";

/** A slow-ish link, so a saved round trip shows up above the noise. */
const CONDITIONS = {
  offline: false,
  latency: 250,
  downloadThroughput: (2000 * 1024) / 8,
  uploadThroughput: (1000 * 1024) / 8,
};

/** Only used when both prices are given; there is no published price to default to. */
const PRICING =
  process.env.BENCH_PRICE_IN && process.env.BENCH_PRICE_OUT
    ? {
        inputPerMillion: Number(process.env.BENCH_PRICE_IN),
        outputPerMillion: Number(process.env.BENCH_PRICE_OUT),
      }
    : null;

/**
 * Records loads the visitor did not ask for: documents the browser speculated, and payloads
 * fetched while the visitor was still on another page.
 */
function watch(page) {
  const seen = [];
  const speculative = new Set();

  page.on("request", (request) => {
    const purpose = request.headers()["sec-purpose"] ?? "";
    const { pathname } = new URL(request.url());
    if (purpose.includes("prefetch") || purpose.includes("prerender")) {
      speculative.add(request);
      return;
    }
    // A payload for a page other than the one on screen was fetched ahead of time.
    if (pathname.endsWith("/_payload.json")) {
      const forPath = pathname.slice(0, -"/_payload.json".length) || "/";
      if (forPath !== new URL(page.url()).pathname.replace(/\/$/, "")) speculative.add(request);
    }
  });

  page.on("response", (response) => {
    const request = response.request();
    if (!speculative.has(request)) return;
    seen.push({
      pathname: new URL(request.url()).pathname,
      bytes: Number(response.headers()["content-length"] ?? 0),
    });
  });

  return seen;
}

async function session(browser, arm, seed) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 860 } });
  await context.addCookies([{ name: "precog_mode", value: arm, url: BASE }]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", CONDITIONS);

  const speculative = watch(page);
  const random = rng(seed);
  const navigations = [];
  const visited = new Set([START]);

  await page.goto(BASE + START);
  await page.waitForLoadState("networkidle");
  await page.mouse.move(100, 120);
  await page.waitForTimeout(900);

  for (let hop = 0; hop < HOPS; hop++) {
    await read(page, random);

    const links = page.locator("main ul a");
    const count = await links.count();
    if (count === 0) break;
    const link = links.nth(pick(random, count));
    const href = await link.getAttribute("href");
    if (!href) break;

    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await link.boundingBox();
    if (!box) break;
    await approach(page, box, random);

    const started = Date.now();
    await Promise.all([page.waitForURL(`**${href}`), link.click()]);
    await page.locator("main h1").waitFor();
    navigations.push({ path: href, ms: Date.now() - started });
    visited.add(href);
    await page.waitForTimeout(300);
  }

  const metrics = await page.evaluate(() => {
    const precog = window.__precog;
    return precog ? precog.metrics : null;
  });

  await context.close();

  // A speculative load for a page the visitor never opened is waste.
  const wasted = speculative.filter(
    (entry) => ![...visited].some((path) => entry.pathname.startsWith(path)),
  );

  return {
    arm,
    seed,
    navigations,
    metrics,
    speculativeLoads: speculative.length,
    speculativeBytes: speculative.reduce((sum, entry) => sum + entry.bytes, 0),
    wastedLoads: wasted.length,
    wastedBytes: wasted.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

const sum = (values) => values.reduce((total, value) => total + value, 0);
const mean = (values) => (values.length === 0 ? 0 : sum(values) / values.length);

function summarize(arm, runs) {
  const times = runs.flatMap((run) => run.navigations.map((navigation) => navigation.ms));
  const metrics = runs.map((run) => run.metrics).filter(Boolean);
  const navigations = sum(metrics.map((m) => m.navigations));
  const calls = sum(metrics.map((m) => m.calls));
  // The other arms have the module paused, so its counters say nothing about them.
  const measured = calls > 0;
  const tokensIn = sum(metrics.map((m) => m.inputTokens));
  const tokensOut = sum(metrics.map((m) => m.outputTokens));
  return {
    arm,
    sessions: runs.length,
    navigations: times.length,
    medianMs: Math.round(percentile(times, 50)),
    p95Ms: Math.round(percentile(times, 95)),
    meanMs: Math.round(mean(times)),
    hitRate: measured && navigations > 0 ? sum(metrics.map((m) => m.hits)) / navigations : null,
    topAccuracy:
      measured && navigations > 0 ? sum(metrics.map((m) => m.topHits)) / navigations : null,
    callsPerSession: metrics.length === 0 ? 0 : mean(metrics.map((m) => m.calls)),
    cacheHitRate: measured ? sum(metrics.map((m) => m.cacheHits)) / calls : null,
    jevP50: Math.round(
      percentile(
        metrics.flatMap((m) => m.latencies),
        50,
      ),
    ),
    jevP95: Math.round(
      percentile(
        metrics.flatMap((m) => m.latencies),
        95,
      ),
    ),
    tokensPerSession:
      metrics.length === 0 ? 0 : Math.round((tokensIn + tokensOut) / metrics.length),
    costPerSession:
      PRICING && metrics.length > 0
        ? (tokensIn * PRICING.inputPerMillion + tokensOut * PRICING.outputPerMillion) /
          1_000_000 /
          metrics.length
        : null,
    speculativeLoadsPerSession: mean(runs.map((run) => run.speculativeLoads)),
    wastedLoadsPerSession: mean(runs.map((run) => run.wastedLoads)),
    wastedKbPerSession: mean(runs.map((run) => run.wastedBytes)) / 1024,
  };
}

const show = (value, digits = 2) =>
  value === null || value === undefined ? "n/a" : value.toFixed(digits);
const percent = (value) => (value === null ? "n/a" : `${Math.round(value * 100)}%`);

function markdown(summaries, meta) {
  const rows = [
    ["arm", ...summaries.map((s) => s.arm)],
    ["navigation median", ...summaries.map((s) => `${s.medianMs} ms`)],
    ["navigation p95", ...summaries.map((s) => `${s.p95Ms} ms`)],
    ["hit rate", ...summaries.map((s) => percent(s.hitRate))],
    ["top guess correct", ...summaries.map((s) => percent(s.topAccuracy))],
    ["speculative loads / session", ...summaries.map((s) => show(s.speculativeLoadsPerSession, 1))],
    ["wasted loads / session", ...summaries.map((s) => show(s.wastedLoadsPerSession, 1))],
    ["wasted kB / session", ...summaries.map((s) => show(s.wastedKbPerSession, 1))],
    ["jev calls / session", ...summaries.map((s) => show(s.callsPerSession, 1))],
    ["jev answered from cache", ...summaries.map((s) => percent(s.cacheHitRate))],
    ["jev latency p50 / p95", ...summaries.map((s) => `${s.jevP50} / ${s.jevP95} ms`)],
    ["tokens / session", ...summaries.map((s) => String(s.tokensPerSession))],
    [
      "cost / session",
      ...summaries.map((s) =>
        s.costPerSession === null ? "n/a" : `$${s.costPerSession.toFixed(5)}`,
      ),
    ],
  ];

  const header = `| ${rows[0].join(" | ")} |`;
  const divider = `| ${rows[0].map(() => "---").join(" | ")} |`;
  const body = rows.slice(1).map((row) => `| ${row.join(" | ")} |`);

  return `# Benchmark

${meta.sessions} synthetic sessions per arm, ${meta.hops} navigations each, real Chrome against
a production build, throttled to ${meta.latency} ms of latency and ${meta.downloadKbps} kbit/s down.

${header}
${divider}
${body.join("\n")}

## How to read this

- The visitors are synthetic. Their click model weights links by position, so hit rate and
  accuracy say how well the module does against that model, not against real people.
- Timings are real. They are wall-clock milliseconds from the click to the new page's heading.
- Predictions came from Jev itself. Latency and token figures are real.
- ${meta.priced ? "Cost uses the prices passed in `BENCH_PRICE_IN` and `BENCH_PRICE_OUT`." : "No prices were given, so cost is not reported. TypeSafe does not publish one."}
- The three arms are not "nothing, something, precog". The playground sets
  \`takeOverNuxtLinkPrefetch\`, so in every arm \`NuxtLink\` still prefetches a link the cursor
  actually rests on. \`off\` therefore means "the browser and Nuxt on their own", which is a
  much stronger baseline than doing nothing, and it is the one worth beating.
- \`native\` is the honest competitor: document rules at \`eagerness: moderate\` cost nothing and
  need no model. Where precog only ties it, say so.

Generated ${meta.at}.
`;
}

if (!process.env.TYPESAFE_API_KEY && !process.env.AI_GATEWAY_API_KEY) {
  console.error(
    "Set TYPESAFE_API_KEY or AI_GATEWAY_API_KEY. The benchmark measures the real service, so\n" +
      "without a key the precog arm would predict nothing and the numbers would be meaningless.",
  );
  process.exit(1);
}

const server = spawn("node", ["packages/nuxt/playground/.output/server/index.mjs"], {
  env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT) },
  stdio: "ignore",
});

try {
  mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(BASE);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  const browser = await chromium.launch({ channel: "chrome" });
  const runs = [];
  for (const arm of ARMS) {
    for (let index = 0; index < SESSIONS; index++) {
      // The same seed in every arm, so all three face the same visitor.
      const run = await session(browser, arm, 1000 + index * 97);
      runs.push(run);
      process.stdout.write(`${arm} session ${index + 1}/${SESSIONS}\r`);
    }
    process.stdout.write(`${arm} done${" ".repeat(20)}\n`);
  }
  await browser.close();

  const summaries = ARMS.map((arm) =>
    summarize(
      arm,
      runs.filter((run) => run.arm === arm),
    ),
  );
  const meta = {
    at: new Date().toISOString(),
    sessions: SESSIONS,
    hops: HOPS,
    latency: CONDITIONS.latency,
    downloadKbps: Math.round((CONDITIONS.downloadThroughput * 8) / 1024),

    priced: PRICING !== null,
  };

  writeFileSync(join(OUT, "bench.json"), `${JSON.stringify({ meta, summaries, runs }, null, 2)}\n`);
  const table = markdown(summaries, meta);
  writeFileSync(join(OUT, "bench.md"), table);
  console.log(table);
} finally {
  server.kill();
}

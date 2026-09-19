/**
 * Records the launch clip: the same visit twice, once with the module off and once with it on,
 * against a server with 400 ms of artificial latency. Writes two videos, and stitches them
 * side by side when ffmpeg is available.
 *
 * Usage: pnpm dev:build && node scripts/record.mjs
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.PRECOG_RECORD_PORT ?? 3210);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "bench/results";
const DELAY_MS = 400;
/**
 * The docs pages are prerendered, so they are served as static files and the server delay
 * middleware never sees them. Throttling the browser is what makes the wait real.
 */
const CONDITIONS = {
  offline: false,
  latency: 300,
  downloadThroughput: (1500 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};
const HOPS = 5;
const VIEWPORT = { width: 900, height: 820 };

/**
 * The same visit in both arms. The cursor travels to each link and clicks soon after
 * arriving, which is what a reader actually does. A long hover would let the browser's own
 * prefetch-on-interaction finish and there would be nothing to compare.
 */
const DWELL_MS = 150;

async function drive(page, overlay, timings) {
  await page.goto(`${BASE}/docs`);
  await page.waitForLoadState("networkidle");
  if (overlay) await page.keyboard.press("Shift+P");
  await page.mouse.move(120, 120);
  await page.waitForTimeout(1800);

  // Read down a chain of docs pages, following a "see also" link each time. Always a page
  // that has not been opened yet, so no arm gets a free ride from an earlier visit.
  const visited = new Set();
  for (let hop = 0; hop < HOPS; hop++) {
    const names = (await page.locator("main ul a").allTextContents()).map((text) => text.trim());
    const index = names.findIndex((text) => !visited.has(text));
    if (index === -1) break;
    const name = names[index];
    visited.add(name);
    const link = page.locator("main ul a").nth(index);

    // The see-also list sits below the fold, so read down to it first. Scrolling is also one
    // of the signals the module sends.
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(500);
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);

    const box = await link.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
    await page.waitForTimeout(DWELL_MS);

    const started = Date.now();
    // Playwright re-checks the link's position before clicking, which a raw mouse click at
    // remembered coordinates does not.
    await link.click();
    await page.getByRole("heading", { name, level: 1 }).waitFor();
    timings.push(Date.now() - started);

    await page.waitForTimeout(1100);
    await page.mouse.move(120, 120, { steps: 12 });
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(800);
}

async function record(label, mode) {
  const dir = join(OUT, `raw-${label}`);
  rmSync(dir, { recursive: true, force: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir, size: VIEWPORT },
  });
  await context.addCookies([
    { name: "precog_delay", value: String(DELAY_MS), url: BASE },
    { name: "precog_mode", value: mode, url: BASE },
  ]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", CONDITIONS);
  const timings = [];
  await drive(page, mode === "precog", timings);
  console.log(`${label}: navigations took ${timings.join(", ")} ms`);
  await context.close();
  await browser.close();

  const file = readdirSync(dir).find((name) => name.endsWith(".webm"));
  const target = join(OUT, `${label}.webm`);
  rmSync(target, { force: true });
  renameSync(join(dir, file), target);
  rmSync(dir, { recursive: true, force: true });
  return target;
}

function duration(file) {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Number(String(out).trim());
}

function has(command) {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const server = spawn("node", ["playground/.output/server/index.mjs"], {
  env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT) },
  stdio: "ignore",
});

try {
  mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(BASE);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  const off = await record("off", "off");
  const on = await record("precog", "precog");
  console.log(`Wrote ${off} and ${on}.`);

  if (has("ffmpeg") && has("ffprobe")) {
    const combined = join(OUT, "precog-demo.mp4");
    // The precog arm finishes sooner, so both sides are frozen on their last frame and the
    // clip runs for as long as the slower one took. That gap is the whole point.
    const longest = Math.max(duration(off), duration(on));
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        off,
        "-i",
        on,
        "-filter_complex",
        "[0:v]tpad=stop_mode=clone:stop_duration=30,pad=iw+2:ih:0:0:color=black[l];" +
          "[1:v]tpad=stop_mode=clone:stop_duration=30[r];[l][r]hstack=inputs=2",
        "-t",
        longest.toFixed(2),
        "-pix_fmt",
        "yuv420p",
        combined,
      ],
      { stdio: "inherit" },
    );
    console.log(`Wrote ${combined}. Left is off, right is precog; the control panel labels both.`);
  } else {
    console.log("ffmpeg not found, so the two clips were not stitched together.");
  }
} finally {
  server.kill();
}

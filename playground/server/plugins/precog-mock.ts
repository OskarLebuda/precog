import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { defineNitroPlugin } from "nitropack/runtime";
import type { PrecogPrediction, PrecogState } from "nuxt-precog";

/**
 * Keeps the playground working without an API key.
 *
 * - `PRECOG_RECORD=1` with a real key writes every answer Jev gives into `recordings.json`.
 * - With that file present, the same page and link set replays the recorded answer.
 * - Otherwise a crude stand-in favours what the cursor is near, what is on screen, and links
 *   that stay in the same section.
 *
 * `PRECOG_MOCK=0` turns replay and the stand-in off, so the playground talks to the real Jev.
 */
const FILE = new URL("../../recordings.json", import.meta.url);

/** The page and its link set, which is what a prediction is really about. */
function keyOf(state: PrecogState) {
  return `${state.page.path}|${state.candidates
    .map((candidate) => candidate.path)
    .sort()
    .join(",")}`;
}

function load(): Record<string, PrecogPrediction> {
  try {
    if (!existsSync(FILE)) return {};
    return JSON.parse(readFileSync(FILE, "utf8")) as Record<string, PrecogPrediction>;
  } catch {
    return {};
  }
}

function guess(state: PrecogState): PrecogPrediction {
  const { candidates, pointer, page } = state;
  const section = page.path.split("/")[1] ?? "";
  const nearest = new Set(pointer.nearestIds);

  const scored = candidates
    .map((candidate) => ({
      id: candidate.id,
      score:
        (candidate.id === pointer.hoveredId ? 3 : 0) +
        (nearest.has(candidate.id) ? 2 : 0) +
        (candidate.inViewport ? 1 : 0) +
        (section && candidate.path.startsWith(`/${section}`) ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  // Geometric decay over the ranking, leaving some probability for "no click at all".
  const decay = 0.65;
  const total = scored.reduce((sum, _, index) => sum + decay ** index, 0);
  return {
    ranks: scored.map((entry, index) => ({
      id: entry.id,
      p: Math.round(((0.85 * decay ** index) / total) * 1000) / 1000,
    })),
    soon: pointer.hoveredId ? 0.9 : pointer.hasHover ? 0.6 : 0.35,
    exit: 0.1,
    cached: false,
    latencyMs: 90,
    usage: { input: 480, output: 28 },
  };
}

export default defineNitroPlugin((nitro) => {
  const recordings = load();

  if (process.env.PRECOG_RECORD === "1") {
    nitro.hooks.hook("precog:predicted", (ctx) => {
      if (ctx.substituted) return;
      recordings[keyOf(ctx.state)] = ctx.prediction;
      writeFileSync(FILE, `${JSON.stringify(recordings, null, 2)}\n`);
    });
  }

  if (process.env.PRECOG_MOCK === "0") return;

  nitro.hooks.hook("precog:predict", (ctx) => {
    ctx.prediction = recordings[keyOf(ctx.state)] ?? guess(ctx.state);
  });
});

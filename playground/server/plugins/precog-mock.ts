import { defineNitroPlugin } from "nitropack/runtime";

/**
 * Answers predictions without an API key, so the playground and the e2e suite run offline.
 * It is a crude stand-in for Jev: it favours what the cursor is near, what is on screen, and
 * links that stay in the same section, then spreads the rest geometrically.
 * Set `PRECOG_MOCK=0` to talk to the real Jev instead.
 */
export default defineNitroPlugin((nitro) => {
  if (process.env.PRECOG_MOCK === "0") return;

  nitro.hooks.hook("precog:predict", (ctx) => {
    const { candidates, pointer, page } = ctx.state;
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
    ctx.prediction = {
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
  });
});

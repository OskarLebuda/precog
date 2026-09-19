import { defineNitroPlugin } from "nitropack/runtime";

/**
 * Answers predictions without an API key, so the playground and the e2e suite run offline.
 * Set `PRECOG_MOCK=0` to talk to the real Jev instead.
 */
export default defineNitroPlugin((nitro) => {
  if (process.env.PRECOG_MOCK === "0") return;

  nitro.hooks.hook("precog:predict", (ctx) => {
    const candidates = ctx.state.candidates;
    // Most of the weight on whichever link the cursor is nearest, so the demo reacts to the mouse.
    const favourite =
      ctx.state.pointer.hoveredId ?? ctx.state.pointer.nearestIds[0] ?? candidates[0]?.id;
    const rest = candidates.length > 1 ? 0.25 / (candidates.length - 1) : 0;
    ctx.prediction = {
      ranks: candidates.map((candidate) => ({
        id: candidate.id,
        p: candidate.id === favourite ? 0.75 : rest,
      })),
      soon: ctx.state.pointer.hasHover ? 0.8 : 0.4,
      exit: 0.1,
      cached: false,
      latencyMs: 90,
      usage: { input: 480, output: 28 },
    };
  });
});

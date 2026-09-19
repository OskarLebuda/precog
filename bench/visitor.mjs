/**
 * A synthetic visitor. Not a real one: it reads a page for a while, scrolls, moves the mouse
 * along a path, then picks a link with a weighted model. Every arm faces the same visitor,
 * because the seed decides every choice.
 */

/** Small deterministic generator, so a session number is a whole visitor. */
export function rng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** Picks an index with weight 1/(rank+1), so early links are likelier but none is certain. */
export function pick(random, count) {
  const weights = Array.from({ length: count }, (_, i) => 1 / (i + 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (const [index, weight] of weights.entries()) {
    roll -= weight;
    if (roll <= 0) return index;
  }
  return count - 1;
}

/** Reading: a few scroll steps with pauses, the way someone skims a page. */
export async function read(page, random) {
  const steps = 2 + Math.floor(random() * 3);
  for (let step = 0; step < steps; step++) {
    await page.mouse.wheel(0, 400 + Math.floor(random() * 500));
    await page.waitForTimeout(250 + Math.floor(random() * 400));
  }
}

/** Moves the cursor to a link over a couple of waypoints, then waits the way a hand does. */
export async function approach(page, box, random) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 180 + random() * 60, y - 120 + random() * 60, { steps: 12 });
  await page.waitForTimeout(60 + Math.floor(random() * 80));
  await page.mouse.move(x, y, { steps: 14 });
  // Short on purpose: a long hover would let the browser's own prefetch finish every time,
  // and then no arm is measuring anything but the hover.
  await page.waitForTimeout(90 + Math.floor(random() * 120));
}

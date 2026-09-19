// Builds the playground with `overlay: "dev"` and checks the overlay is not in the output.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const OUTPUT = "playground/.output";
const NEEDLES = ["precog-hud", "precog-badge", "nuxt-precog:overlay"];

execFileSync("pnpm", ["exec", "nuxt", "build", "playground"], {
  stdio: "inherit",
  env: { ...process.env, PRECOG_OVERLAY: "dev", NODE_ENV: "production" },
});

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const found = [];
for (const path of files(OUTPUT)) {
  if (!/\.(js|mjs|css|html|json)$/.test(path)) continue;
  const text = readFileSync(path, "utf8");
  for (const needle of NEEDLES) if (text.includes(needle)) found.push(`${needle} in ${path}`);
}

if (found.length > 0) {
  console.error("Overlay code leaked into the production build:");
  for (const hit of found) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(`No overlay code in ${OUTPUT}. Checked for: ${NEEDLES.join(", ")}.`);

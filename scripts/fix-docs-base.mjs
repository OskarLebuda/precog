/**
 * Prefixes the paths undocs writes from the domain root.
 *
 * GitHub Pages serves this repository's site under `/nuxt-precog/`. `NUXT_APP_BASE_URL` moves
 * the bundled assets, but undocs hardcodes its logo and favicon as `/icon.svg`, which the base
 * URL never touches, so the logo 404s on a project page. This rewrites those.
 *
 * Usage: NUXT_APP_BASE_URL=/nuxt-precog/ node scripts/fix-docs-base.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUTPUT = "docs/.docs/.output/public";
const base = process.env.NUXT_APP_BASE_URL;

if (!base || base === "/") {
  console.log("No base URL set, nothing to rewrite.");
  process.exit(0);
}

const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
// Only the fully quoted forms, so a longer path that merely ends in the same characters is
// never touched. It appears in the prerendered HTML and in the app config inside the bundle.
const ROOTED = ['"/icon.svg"', "'/icon.svg'", "`/icon.svg`"];

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

let changed = 0;
for (const path of files(OUTPUT)) {
  if (!/\.(html|json|js|mjs)$/.test(path)) continue;
  const text = readFileSync(path, "utf8");
  let next = text;
  for (const needle of ROOTED) {
    next = next.split(needle).join(needle.replace("/icon.svg", `${prefix}/icon.svg`));
  }
  if (next !== text) {
    writeFileSync(path, next);
    changed++;
  }
}

console.log(`Rewrote /icon.svg to ${prefix}/icon.svg in ${changed} files.`);

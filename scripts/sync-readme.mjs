/**
 * Copies the root README into every published package.
 *
 * npm reads the README out of the tarball, and only the tarball: a package without one shows an
 * empty page, and no later edit can change what an already published version displays. pnpm
 * copies the root LICENSE into each package on its own but does nothing for the README.
 *
 * Relative paths are rewritten to absolute GitHub URLs on the way. npm resolves them against
 * `repository.directory`, which points at `packages/<name>`, so `./LICENSE` would look for a
 * file inside the package and the banner would 404.
 *
 * Usage: node scripts/sync-readme.mjs
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGES = ["core", "nuxt", "next"];
const BLOB = "https://github.com/OskarLebuda/precog/blob/main";
const RAW = "https://raw.githubusercontent.com/OskarLebuda/precog/main";

// GitHub serves directories under `tree` and files under `blob`. A name with an extension is a
// file, and so is a bare capitalised one like LICENSE.
const target = (path) => {
  const clean = path.replace(/^\.\//, "");
  if (/\.(jpe?g|png|gif|svg|webp)$/i.test(clean)) return `${RAW}/${clean}`;
  const name = clean.split("/").pop();
  const isFile = name.includes(".") || name === name.toUpperCase();
  return `${isFile ? BLOB : BLOB.replace("/blob/", "/tree/")}/${clean}`;
};

const readme = readFileSync("README.md", "utf8")
  .replace(/(src|href)="(\.\/[^"]+)"/g, (_, attr, path) => `${attr}="${target(path)}"`)
  .replace(/\]\((\.\/[^)]+)\)/g, (_, path) => `](${target(path)})`);

if (readme.includes('="./') || readme.includes("](./")) {
  throw new Error("A relative path survived the rewrite.");
}

for (const pkg of PACKAGES) {
  writeFileSync(join("packages", pkg, "README.md"), readme);
}
console.log(`Synced the README into ${PACKAGES.length} packages.`);

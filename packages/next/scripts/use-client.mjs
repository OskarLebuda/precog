/**
 * Puts `"use client"` back on the client entry.
 *
 * The bundler drops the directive, and without it Next treats `PrecogProvider` as a server
 * component and every hook in it throws. Nothing in the build fails, so this also asserts the
 * result rather than trusting the write.
 *
 * Only the client entry is marked. `server.mjs` must stay outside the client graph, and the
 * chunk they share holds plain data with no hooks in it.
 */
import { readFileSync, writeFileSync } from "node:fs";

const ENTRY = "dist/index.mjs";
const DIRECTIVE = '"use client";';

const source = readFileSync(ENTRY, "utf8");
if (!source.startsWith(DIRECTIVE)) {
  writeFileSync(ENTRY, `${DIRECTIVE}\n${source}`);
}

const written = readFileSync(ENTRY, "utf8");
if (!written.startsWith(DIRECTIVE)) {
  console.error(`${ENTRY} does not start with ${DIRECTIVE}`);
  process.exit(1);
}

const server = readFileSync("dist/server.mjs", "utf8");
if (server.startsWith(DIRECTIVE)) {
  console.error("dist/server.mjs must not be a client module");
  process.exit(1);
}

console.log(`${ENTRY} is marked ${DIRECTIVE}, dist/server.mjs is not.`);

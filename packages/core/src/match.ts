/** Path glob matching for the `include` and `exclude` options. Pure, shared by client and server. */

const escaped = /[.+^${}()|[\]\\]/g;
const wildcards = /\*\*|\*|\?/g;

// `**` crosses slashes, `*` does not, `?` is one character that is not a slash.
function toRegExp(glob: string): RegExp {
  const source = glob
    .replace(escaped, "\\$&")
    .replace(wildcards, (match) => (match === "**" ? ".*" : match === "*" ? "[^/]*" : "[^/]"));
  return new RegExp(`^${source}$`);
}

const cache = new Map<string, RegExp>();

function regExpOf(glob: string): RegExp {
  let re = cache.get(glob);
  if (!re) {
    re = toRegExp(glob);
    cache.set(glob, re);
  }
  return re;
}

/** True when the path matches any of the globs. An empty list matches nothing. */
export function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => regExpOf(glob).test(path));
}

/**
 * True when a path may be speculated: inside `include` when it is set, and outside `exclude`.
 * Matching ignores the query string, so `/cart?x=1` is still caught by `/cart`.
 */
export function isAllowedPath(
  path: string,
  include: readonly string[] = [],
  exclude: readonly string[] = [],
): boolean {
  const bare = path.split("?")[0] ?? path;
  if (include.length > 0 && !matchesAny(bare, include)) return false;
  return !matchesAny(bare, exclude);
}

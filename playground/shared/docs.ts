export const DOC_SLUGS = [
  "getting-started",
  "options",
  "policy",
  "speculation-rules",
  "nuxt-preloading",
  "privacy",
  "telemetry",
  "overlay",
  "benchmarks",
  "troubleshooting",
  "edge-runtimes",
  "faq",
] as const;

export type DocSlug = (typeof DOC_SLUGS)[number];

export function docTitle(slug: string) {
  return slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** A body big enough that fetching it over a throttled link is something you can feel. */
export function docBody(slug: string) {
  const sentence = `The ${docTitle(slug).toLowerCase()} page exists so a navigation has real content behind it. `;
  return Array.from({ length: 40 }, (_, i) => `${i + 1}. ${sentence.repeat(6)}`);
}

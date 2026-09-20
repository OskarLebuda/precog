export const DOC_SLUGS = [
  "getting-started",
  "options",
  "policy",
  "speculation-rules",
  "next-prefetching",
  "privacy",
  "telemetry",
  "overlay",
  "benchmarks",
  "troubleshooting",
  "edge-runtimes",
  "faq",
] as const;

export const docTitle = (slug: string) =>
  slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Long enough that a navigation has real content behind it. */
export const docBody = (slug: string) => {
  const sentence = `The ${docTitle(slug).toLowerCase()} page exists so a navigation has real content behind it. `;
  return Array.from({ length: 40 }, (_, i) => `${i + 1}. ${sentence.repeat(6)}`);
};

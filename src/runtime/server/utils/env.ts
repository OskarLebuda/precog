/** Optional environment lookup. Only runtimes with a Node-style `process.env` answer. */
export function readEnv(name: string): string | undefined {
  const global = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return global.process?.env?.[name]?.trim() || undefined;
}

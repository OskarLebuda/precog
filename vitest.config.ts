import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**"],
      // The orchestrator only exists to wire browser events together; Playwright covers it.
      // `env.ts` is a three-line lookup that no runtime under vitest can exercise.
      exclude: [
        "packages/core/src/orchestrator.ts",
        "packages/core/src/server/env.ts",
        "packages/core/src/{index,client,server}.ts",
      ],
      reporter: ["text", "json-summary"],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});

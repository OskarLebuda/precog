import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/runtime/core/**", "src/runtime/server/utils/**"],
      // The orchestrator only exists to wire browser events together; Playwright covers it.
      // `env.ts` is a three-line lookup that no runtime under vitest can exercise.
      exclude: ["src/runtime/core/orchestrator.ts", "src/runtime/server/utils/env.ts"],
      reporter: ["text", "json-summary"],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});

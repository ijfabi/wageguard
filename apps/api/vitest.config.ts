import { defineConfig } from "vitest/config";

import { sourceResolution } from "../../vitest.shared.js";

export default defineConfig({
  ...sourceResolution,
  // NestJS uses legacy (TypeScript experimental) decorators.
  oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/main.ts"],
      reporter: ["text", "json-summary"],
      // Measured at introduction: 94.9% lines, 83.5% branches. Gates sit just below to block regressions.
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
  },
});

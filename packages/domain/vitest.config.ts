import { defineConfig } from "vitest/config";

import { sourceResolution } from "../../vitest.shared.js";

export default defineConfig({
  ...sourceResolution,
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      reporter: ["text", "json-summary", "lcov"],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});

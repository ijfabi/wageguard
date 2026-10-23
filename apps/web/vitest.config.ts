import path from "node:path";

import { defineConfig } from "vitest/config";

import { sourceResolution } from "../../vitest.shared.js";

export default defineConfig({
  ...sourceResolution,
  resolve: { ...sourceResolution.resolve, alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/api/**"],
      reporter: ["text", "json-summary"],
    },
  },
});

import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

import { sourceResolution } from "../../vitest.shared.js";

export default defineConfig({
  ...sourceResolution,
  // Resolve dependencies the way Node does at runtime. Vite's "module" condition would pick ESM
  // builds that Node cannot load (for example @opentelemetry/api's extensionless imports).
  ssr: {
    resolve: {
      conditions: ["@wageguard/source", ...defaultServerConditions.filter((c) => c !== "module")],
    },
  },
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
      // main.ts and otel.ts are process entry points (otel.ts is verified against a live collector,
      // see docs/observability.md).
      exclude: ["src/generated/**", "src/main.ts", "src/otel.ts"],
      reporter: ["text", "json-summary"],
      // Measured at introduction: 94.9% lines, 83.5% branches. Gates sit just below to block regressions.
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
  },
});

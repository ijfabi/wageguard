// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/*.d.ts",
      "benchmarks/results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.mjs", "*.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "no-console": "error",
    },
  },
  {
    // Monetary safety: the calculation packages must never use parseFloat / Number() / toFixed on money.
    files: ["packages/domain/src/**/*.ts", "packages/calculation-engine/src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "Use Money/Decimal for monetary values." },
      ],
      "no-restricted-properties": [
        "error",
        { property: "toFixed", message: "Use Money rounding with an explicit RoundingMode." },
        { object: "Math", property: "round", message: "Use Decimal rounding with an explicit RoundingMode." },
      ],
    },
  },
  {
    // Plain JavaScript config files are linted without type information.
    files: ["**/*.mjs", "**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["**/scripts/**/*.ts", "**/scripts/**/*.mjs"],
    rules: { "no-console": "off" },
  },
  prettier,
);

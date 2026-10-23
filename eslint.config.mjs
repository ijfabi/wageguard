// @ts-check
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
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
      "benchmarks/test-reports/**",
      "**/src/generated/**",
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
      // NestJS modules are decorated classes whose content lives in the decorator.
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
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
    // Web app: browser globals, Next.js rules (including Core Web Vitals) and the React Hooks rules.
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
      "@next/next/no-html-link-for-pages": "off",
    },
    settings: { next: { rootDir: "apps/web" } },
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
    // HTTP integration tests: supertest types response bodies as `any`; the assertions themselves
    // validate those bodies. Application source keeps the full strict rule set.
    files: ["apps/*/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
  {
    files: ["**/scripts/**/*.ts", "**/scripts/**/*.mjs"],
    rules: { "no-console": "off" },
  },
  prettier,
);

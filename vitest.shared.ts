import { defaultClientConditions, defaultServerConditions, type UserConfig } from "vite";

/**
 * Workspace packages export their TypeScript sources under the "@wageguard/source" condition so
 * tests run against src/ without a build step. Vite resolves Node-side (SSR) imports with a separate
 * condition list, so the condition is added to both, alongside Vite's defaults.
 */
const SOURCE_CONDITION = "@wageguard/source";

export const sourceResolution: Pick<UserConfig, "resolve" | "ssr"> = {
  resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
  ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
};

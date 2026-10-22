import { execFileSync } from "node:child_process";
import path from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const POSTGRES_IMAGE = "postgres:17.6-alpine"; // same image as docker-compose.yml
const API_ROOT = path.resolve(import.meta.dirname, "..");

let container: StartedPostgreSqlContainer | undefined;

/**
 * Starts a throwaway PostgreSQL and applies the real migrations (including the triggers and
 * exclusion constraint), so integration tests exercise exactly what production runs.
 */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase("wageguard_test")
    .withUsername("wageguard")
    .withPassword("test-only-password")
    .start();
  const databaseUrl = container.getConnectionUri();
  execFileSync(
    process.execPath,
    [path.join(API_ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
    {
      cwd: API_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    },
  );
  project.provide("databaseUrl", databaseUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}

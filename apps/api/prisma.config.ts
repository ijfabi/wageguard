import { defineConfig } from "prisma/config";

// DATABASE_URL is read from the process environment (no .env loading here). `prisma generate`
// does not connect, so a placeholder is acceptable when the variable is absent.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "postgresql://placeholder@localhost:5432/placeholder",
  },
});

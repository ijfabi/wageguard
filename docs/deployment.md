# Deployment

## Local stack (verified 2026-10-22)

```bash
docker compose up --build
```

This starts:

1. **postgres** (17.6-alpine) and **redis** (8.2-alpine), with health checks, bound to 127.0.0.1.
2. **migrate**, a one-off container that runs `prisma migrate deploy` once Postgres is healthy and then exits.
3. **api** on http://localhost:3001, which starts only after `migrate` exits successfully. It runs as the non-root `node` user, with a container health check on `/api/v1/health`.

Smoke-tested by running register, employment, shift, payslip, audit, idempotent replay and report download against the containers. The API ran with `NODE_ENV=production` and the `__Host-` Secure session cookie (browsers treat `http://localhost` as a secure context). Redis is started for future background work but is not used yet ([ADR 0010](adr/0010-audits-idempotency-and-immutability.md)).

For development without containers:

```bash
docker compose up -d postgres
cp .env.example .env    # then export the variables, or set them in your shell
pnpm --filter @wageguard/api migrate:deploy
pnpm --filter @wageguard/api dev
```

## Configuration

Validated at startup by `apps/api/src/config/config.ts`. The process exits with the names of any invalid variables, never their values.

| Variable                     | Default                 | Notes                                                   |
| ---------------------------- | ----------------------- | ------------------------------------------------------- |
| `DATABASE_URL`               | required                | `postgresql://...`                                      |
| `NODE_ENV`                   | `development`           | `production` requires `COOKIE_SECURE=true`              |
| `PORT`                       | `3001`                  |                                                         |
| `ALLOWED_ORIGINS`            | `http://localhost:3000` | Comma-separated; used by CORS and the CSRF origin guard |
| `SESSION_TTL_HOURS`          | `12`                    |                                                         |
| `COOKIE_SECURE`              | `false`                 | Secure cookie with the `__Host-` prefix                 |
| `LOG_LEVEL`                  | `info`                  | pino levels or `silent`                                 |
| `RATE_LIMIT_PER_MINUTE`      | `120`                   | Per client IP, all routes                               |
| `AUTH_RATE_LIMIT_PER_MINUTE` | `10`                    | Register, login and delete-account                      |

## Operational behaviour

- **Migrations.** These run as a separate release step (the `migrate` image target), never at API start-up, so multiple API instances cannot race on schema changes.
- **Health and readiness.** `/api/v1/health` is liveness and never touches dependencies. `/api/v1/ready` checks PostgreSQL and returns `503 NOT_READY` when it is unreachable.
- **Graceful shutdown.** `enableShutdownHooks()` closes the HTTP server and disconnects Prisma on SIGTERM.
- **Logging.** Structured JSON logs (pino), one line per request, with the correlation id, method, path (no query string), status and duration. Request bodies and credential headers are never logged.

## Not yet done

- **Optional AWS demo** (Terraform). It will **never** be applied without explicit approval and will use synthetic data only.
- **Backup and recovery runbook, incident runbook.** Planned with the AWS design.
- **OpenTelemetry tracing.** Planned for Phase 4.

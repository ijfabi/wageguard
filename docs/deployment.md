# Deployment

## Local stack (verified 2026-10-22)

```bash
docker compose up --build
```

This starts:

1. **postgres** (17.6-alpine) and **redis** (8.2-alpine), with health checks, bound to 127.0.0.1.
2. **migrate**, a one-off container that runs `prisma migrate deploy` once Postgres is healthy and then exits.
3. **api** on http://localhost:3001, which starts only after `migrate` exits successfully. It runs as the non-root `node` user, with a container health check on `/api/v1/health`.
4. **web** on http://localhost:3000 (Next.js standalone server, non-root, package managers removed), which starts once the API is healthy. `/api/v1/*` is rewritten to `http://api:3001` (fixed at image build time via the `API_ORIGIN` build argument).

Smoke-tested by running register, employment, shift, payslip, audit, idempotent replay and report download against the containers. On 2026-10-23 the Playwright suite (10 tests, including the PDF download and the nonce CSP checks) also passed against the production containers, and telemetry from the API container was checked against the `observability` profile. The API ran with `NODE_ENV=production` and the `__Host-` Secure session cookie (browsers treat `http://localhost` as a secure context). Redis is started for future background work but is not used yet ([ADR 0010](adr/0010-audits-idempotency-and-immutability.md)).

For development without containers:

```bash
docker compose up -d postgres
cp .env.example .env    # then export the variables, or set them in your shell
pnpm --filter @wageguard/api migrate:deploy
pnpm --filter @wageguard/api dev
```

## Configuration

Validated at startup by `apps/api/src/config/config.ts`. The process exits with the names of any invalid variables, never their values.

| Variable                      | Default                 | Notes                                                     |
| ----------------------------- | ----------------------- | --------------------------------------------------------- |
| `DATABASE_URL`                | required                | `postgresql://...`                                        |
| `NODE_ENV`                    | `development`           | `production` requires `COOKIE_SECURE=true`                |
| `PORT`                        | `3001`                  |                                                           |
| `ALLOWED_ORIGINS`             | `http://localhost:3000` | Comma-separated; used by CORS and the CSRF origin guard   |
| `SESSION_TTL_HOURS`           | `12`                    |                                                           |
| `COOKIE_SECURE`               | `false`                 | Secure cookie with the `__Host-` prefix                   |
| `LOG_LEVEL`                   | `info`                  | pino levels or `silent`                                   |
| `RATE_LIMIT_PER_MINUTE`       | `120`                   | Per client IP, all routes                                 |
| `AUTH_RATE_LIMIT_PER_MINUTE`  | `10`                    | Register, login and delete-account                        |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset (telemetry off)   | OTLP/HTTP endpoint; see [observability](observability.md) |

## Operational behaviour

- **Migrations.** These run as a separate release step (the `migrate` image target), never at API start-up, so multiple API instances cannot race on schema changes.
- **Health and readiness.** `/api/v1/health` is liveness and never touches dependencies. `/api/v1/ready` checks PostgreSQL and returns `503 NOT_READY` when it is unreachable.
- **Graceful shutdown.** `enableShutdownHooks()` closes the HTTP server and disconnects Prisma on SIGTERM.
- **Logging.** Structured JSON logs (pino), one line per request, with the correlation id, method, path (no query string), status and duration. Request bodies and credential headers are never logged. With telemetry on, each line also carries `trace_id` and `span_id`.
- **Telemetry.** The API image starts with `--import ./dist/otel.js`, which does nothing until `OTEL_EXPORTER_OTLP_ENDPOINT` is set. `docker compose --profile observability` adds a local Grafana LGTM container on http://localhost:3003 ([observability](observability.md)).

## Not yet done

- **Optional AWS demo** (Terraform). It will **never** be applied without explicit approval and will use synthetic data only.
- **Backup and recovery runbook, incident runbook.** Planned with the AWS design.

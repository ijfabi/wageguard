# Deployment

## Running locally

```bash
docker compose up --build
```

This starts four things, in order:

1. PostgreSQL 17.6 and Redis 8.2, each with a health check, listening on 127.0.0.1 only.
2. A one-off `migrate` container. It runs `prisma migrate deploy` once PostgreSQL is healthy, then exits.
3. The API on http://localhost:3001. It only starts after the migrations succeed, runs as the unprivileged `node` user, and has a health check on `/api/v1/health`.
4. The web app on http://localhost:3000. It's the Next.js standalone server, also unprivileged, and it starts once the API is healthy. Requests to `/api/v1/*` are forwarded to the API container. That address is fixed when the image is built, through the `API_ORIGIN` build argument.

The stack has been checked end to end. On 2026-10-22 the whole flow (register, add a job, shifts, a payslip, an audit, a retried audit and a report download) was run against the containers. On 2026-10-23 the full Playwright suite passed against them too. The API ran with `NODE_ENV=production` and the `__Host-` secure session cookie, which works on `http://localhost` because browsers treat localhost as secure. Redis is started but nothing uses it yet ([ADR 0010](adr/0010-audits-idempotency-and-immutability.md)).

To work on the API without containers:

```bash
docker compose up -d postgres
cp .env.example .env    # then export the variables, or set them in your shell
pnpm --filter @wageguard/api migrate:deploy
pnpm --filter @wageguard/api dev
```

## Configuration

`apps/api/src/config/config.ts` checks the environment at startup. If anything is wrong, the process exits and names the variables involved, but never prints their values.

| Variable                      | Default                 | Notes                                                    |
| ----------------------------- | ----------------------- | -------------------------------------------------------- |
| `DATABASE_URL`                | required                | `postgresql://...`                                       |
| `NODE_ENV`                    | `development`           | `production` requires `COOKIE_SECURE=true`               |
| `PORT`                        | `3001`                  |                                                          |
| `ALLOWED_ORIGINS`             | `http://localhost:3000` | Comma-separated; used for CORS and the CSRF origin check |
| `SESSION_TTL_HOURS`           | `12`                    |                                                          |
| `COOKIE_SECURE`               | `false`                 | Secure cookie with the `__Host-` prefix                  |
| `LOG_LEVEL`                   | `info`                  | Any pino level, or `silent`                              |
| `RATE_LIMIT_PER_MINUTE`       | `120`                   | Per client IP, across all routes                         |
| `AUTH_RATE_LIMIT_PER_MINUTE`  | `10`                    | Register, sign in and delete account                     |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset (telemetry off)   | See [observability](observability.md)                    |

## How it behaves in operation

- **Migrations.** These run as their own release step (the `migrate` image target), never when the API starts, so several API instances can't race to change the schema.
- **Index changes on big tables.** The Phase 5 index migration uses a plain `CREATE INDEX`, which locks the table against writes while it builds. That's fine for a new database. On a large existing one, build the indexes with `CREATE INDEX CONCURRENTLY` first ([ADR 0015](adr/0015-query-shape-indexes-and-fail-fast.md)).
- **Health checks.** `/api/v1/health` only says the process is alive and never touches the database. `/api/v1/ready` checks PostgreSQL and returns `503 NOT_READY` when it can't reach it.
- **Database outages.** If PostgreSQL goes away, requests fail after at most 3 seconds with `503 SERVICE_UNAVAILABLE` and a `Retry-After` header, and the API recovers by itself once the database is back. In Benchmark E, audits started completing again 1.35 seconds after a stopped database came back ([performance](performance.md)).
- **Shutdown.** On SIGTERM the API closes its HTTP server and disconnects from the database.
- **Logs.** The API writes one JSON line per request, with the correlation ID, method, path (without the query string), status and duration. Request bodies and credential headers are never logged. With telemetry on, each line also carries the trace and span IDs.
- **Telemetry.** The image starts with `--import ./dist/otel.js`, which does nothing until `OTEL_EXPORTER_OTLP_ENDPOINT` is set. `docker compose --profile observability` adds a local Grafana container on http://localhost:3003 ([observability](observability.md)).

## Not done yet

- An optional AWS demo, described in Terraform. It won't be applied without explicit approval, and it would only ever hold synthetic data.
- Backup, recovery and incident runbooks, which belong with the AWS design.

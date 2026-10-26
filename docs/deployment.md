# Deployment

## Running locally

```bash
docker compose up --build
```

This starts five things, in order:

1. PostgreSQL 17.6, Redis 8.2 and Mailpit, each with a health check, listening on 127.0.0.1 only. Mailpit catches every email the API sends; its inbox is at http://localhost:8025.
2. A one-off `migrate` container. It runs `prisma migrate deploy` once PostgreSQL is healthy, then exits.
3. The API on http://localhost:3001. It only starts after the migrations succeed, runs as the unprivileged `node` user, and has a health check on `/api/v1/health`.
4. The web app on http://localhost:3000. It's the Next.js standalone server, also unprivileged, and it starts once the API is healthy. Requests to `/api/v1/*` are forwarded to the API container. That address is fixed when the image is built, through the `API_ORIGIN` build argument.

After signing up, open the confirmation email in Mailpit to finish creating the account. Compose sets a local-only two-step key, so two-step sign-in works too.

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

| Variable                      | Default                                  | Notes                                                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | required                                 | `postgresql://...`                                                                                                                                                                                              |
| `NODE_ENV`                    | `development`                            | `production` requires `COOKIE_SECURE=true`                                                                                                                                                                      |
| `PORT`                        | `3001`                                   |                                                                                                                                                                                                                 |
| `ALLOWED_ORIGINS`             | `http://localhost:3000`                  | Comma-separated; used for CORS and the CSRF origin check                                                                                                                                                        |
| `SESSION_TTL_HOURS`           | `12`                                     |                                                                                                                                                                                                                 |
| `COOKIE_SECURE`               | `false`                                  | Secure cookie with the `__Host-` prefix                                                                                                                                                                         |
| `LOG_LEVEL`                   | `info`                                   | Any pino level, or `silent`                                                                                                                                                                                     |
| `RATE_LIMIT_PER_MINUTE`       | `120`                                    | Per client IP, across all routes                                                                                                                                                                                |
| `AUTH_RATE_LIMIT_PER_MINUTE`  | `10`                                     | Sign-up, sign-in, email links, password and two-step changes, and delete account                                                                                                                                |
| `TRUST_PROXY`                 | `0`                                      | How many proxies in front of the API to trust for the client address. Set it to `1` behind a load balancer, or every user shares one rate limit. Leave it at `0` otherwise, so clients can't fake their address |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset (telemetry off)                    | See [observability](observability.md)                                                                                                                                                                           |
| `RATE_LIMIT_STORE`            | `postgres`                               | Where rate-limit counters live. `postgres` is shared by every API instance; `memory` keeps them in the process (the tests use it)                                                                               |
| `APP_BASE_URL`                | first `ALLOWED_ORIGINS` entry            | The web app's address, used for links in emails                                                                                                                                                                 |
| `MAIL_TRANSPORT`              | `smtp` in production, otherwise `outbox` | `outbox` writes each email to a JSON file in `MAIL_OUTBOX_DIR` instead of sending it, and is refused in production                                                                                              |
| `SMTP_URL`                    | required for `smtp`                      | `smtp://` or `smtps://`, with credentials. A secret                                                                                                                                                             |
| `MAIL_FROM`                   | required for `smtp`                      | For example `WageGuard <no-reply@example.com>`                                                                                                                                                                  |
| `MAIL_OUTBOX_DIR`             | `.mail-outbox`                           | Git-ignored                                                                                                                                                                                                     |
| `TOTP_ENCRYPTION_KEY`         | unset (two-step sign-in off)             | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts two-step secrets. A secret, and it must never change once people have enrolled                                                                    |

## How it behaves in operation

- **Migrations.** These run as their own release step (the `migrate` image target), never when the API starts, so several API instances can't race to change the schema.
- **Index changes on big tables.** The Phase 5 index migration uses a plain `CREATE INDEX`, which locks the table against writes while it builds. That's fine for a new database. On a large existing one, build the indexes with `CREATE INDEX CONCURRENTLY` first ([ADR 0015](adr/0015-query-shape-indexes-and-fail-fast.md)).
- **Health checks.** `/api/v1/health` only says the process is alive and never touches the database. `/api/v1/ready` checks PostgreSQL and returns `503 NOT_READY` when it can't reach it.
- **Database outages.** If PostgreSQL goes away, requests fail after at most 3 seconds with `503 SERVICE_UNAVAILABLE` and a `Retry-After` header, and the API recovers by itself once the database is back. In Benchmark E, audits started completing again 1.35 seconds after a stopped database came back ([performance](performance.md)).
- **Shutdown.** On SIGTERM the API closes its HTTP server and disconnects from the database.
- **Logs.** The API writes one JSON line per request, with the correlation ID, method, path (without the query string), status and duration. Request bodies and credential headers are never logged. With telemetry on, each line also carries the trace and span IDs.
- **Telemetry.** The image starts with `--import ./dist/otel.js`, which does nothing until `OTEL_EXPORTER_OTLP_ENDPOINT` is set. `docker compose --profile observability` adds a local Grafana container on http://localhost:3003 ([observability](observability.md)).

## AWS (designed, validated, never deployed)

`infra/aws` describes a small AWS deployment in Terraform. Nothing has been applied, because applying it creates billable resources, and that needs explicit approval first. It's also only ever meant to hold synthetic data.

```mermaid
flowchart LR
  user((Browser)) -->|HTTPS| alb["Application Load Balancer<br/>TLS 1.2+, HTTP redirects to HTTPS"]
  alb -->|"/api/v1/*"| api["ECS Fargate: api<br/>(1 task)"]
  alb -->|everything else| web["ECS Fargate: web"]
  api -->|"TLS, verified"| rds[("RDS PostgreSQL 17<br/>private subnets, encrypted,<br/>7-day point-in-time backups")]
  migrate["ECS task: migrate<br/>(run once per release)"] --> rds
  secrets["Secrets Manager<br/>database URLs, SMTP URL,<br/>two-step key"] -.-> api
  secrets -.-> migrate
  api -->|SMTP| ses["Email provider<br/>(for example Amazon SES)"]
  api -.->|logs| cw["CloudWatch Logs"]
  web -.->|logs| cw
```

The load balancer sends `/api/v1/*` to the API and everything else to the web app, so the browser still sees one site and the cookies work exactly as they do locally. Fargate tasks run in public subnets with public IPs, but their security group only accepts traffic from the load balancer. That avoids the cost of a NAT gateway. The database sits in private subnets with no internet route and only accepts connections from the tasks. Images are kept in ECR, which scans them on push and won't let a tag be overwritten.

The API runs as a single task to keep costs down. Its rate-limit counters are in PostgreSQL, so adding tasks wouldn't change the limits. It's told to trust one proxy hop (`TRUST_PROXY=1`), so rate limits apply per visitor rather than to the load balancer.

The two connection strings, the SMTP URL and the two-step key live in Secrets Manager and are injected when a task starts. Terraform generates the two-step key once and keeps it in state; replacing it would break every enrolled authenticator. It creates the SMTP secret empty, so the SMTP credentials never enter Terraform state. The API's string asks node-postgres to verify the database's TLS certificate against Amazon's RDS certificate bundle, which is baked into the API image. Prisma's migration engine spells those options differently, so the migration task gets its own string.

To deploy, once approved:

1. Create an ACM certificate for the domain, then copy `terraform.tfvars.example` to `terraform.tfvars` and fill it in. Configure a remote state backend (such as S3 with encryption and versioning), because the state contains the database password.
2. Run `terraform init` and `terraform apply`, then point the domain's DNS at the `load_balancer_dns_name` output.
3. Build the three images (`docker build -f apps/api/Dockerfile --target runtime`, `--target migrate`, and `apps/web/Dockerfile`), tag them with `image_tag`, and push them to the `ecr_repositories` outputs.
4. Put the SMTP URL in the `smtp-url` secret, for example with `aws secretsmanager put-secret-value --secret-id <name>/smtp-url --secret-string 'smtps://USER:PASS@email-smtp.ap-southeast-2.amazonaws.com:465'`. The API tasks won't start until it has a value. `mail_from` must use a domain the provider has verified.
5. Run the migrations with the `migrate_command` output before the services start or update.

**What's been checked:** `terraform fmt`, `terraform init` and `terraform validate` pass with Terraform 1.16.5 and AWS provider 6.68.0, and CI repeats those checks on every push.

**What hasn't:** nothing has been applied, so these are all untested against real AWS:

- that the tasks start;
- that the health checks pass;
- that verified TLS to RDS works for both the API and the migrations;
- that the deployment circuit breaker rolls back as expected.

The first deployment should check each of these.

Running it costs money. The main costs are the load balancer, the RDS instance and the two Fargate tasks, which run around the clock. Check the AWS Pricing Calculator for the region before applying, and `terraform destroy` it when the demo is over. Deletion protection on the database has to be turned off first.

## Azure (designed, validated, never deployed)

`infra/azure` is the same deployment for Azure: Container Apps for the API, web app and migration job, PostgreSQL 17 Flexible Server inside a virtual network, Key Vault for the connection strings, the SMTP URL and the two-step key, and Log Analytics for logs. The main difference from AWS is that the web app is the only public endpoint and proxies `/api/v1/*` to an internal-only API, so the web image has to be built with `--build-arg API_ORIGIN=` set to the `api_origin` output.

To deploy, once approved:

1. Copy `terraform.tfvars.example` to `terraform.tfvars`, set the subscription, and configure a remote state backend.
2. The container apps can't start until their images are in the registry, and the registry is created by this same configuration. So the first time only, create the registry on its own with `terraform apply -target=azurerm_container_registry.main`.
3. Build the three images (the web one with `API_ORIGIN` as above), tag them with `image_tag` and push them to the `registry` output.
4. Run the full `terraform apply`. The API won't report ready until step 5 has created the tables.
5. Start the migration job with `az containerapp job start` using the `migrate_job` and `resource_group` outputs. On later releases, push the new images and run the job before applying the new `image_tag`.
6. Replace the placeholder SMTP URL with `az keyvault secret set --vault-name <vault> --name smtp-url --value 'smtps://...'`, then restart the API revision. Terraform ignores later changes to that secret's value, so it won't put the placeholder back.
   `terraform fmt`, `init` and `validate` pass with Terraform 1.16.5 and azurerm 5.9.0, and CI repeats them on every push. Nothing else has been checked. The diagrams, the comparison with AWS, the Terraform command reference and a proposed production design are in [infrastructure](infrastructure.md).

## Runbooks

- [Backup and recovery](runbooks/backup-and-recovery.md). The local backup and restore was tested on 2026-10-25.
- [Incident response](runbooks/incident-response.md).

# Deployment

## Local (available now)

```bash
cp .env.example .env
docker compose up -d     # PostgreSQL 17.6 and Redis 8.2 with health checks, bound to 127.0.0.1
```

`docker-compose.yml` has been written but **not yet run**, because the Docker daemon was not running on the development machine on 2026-10-22. Application containers (`api`, `web`) will be added in Phases 2 and 3, so that `docker compose up --build` starts the whole stack.

## Planned

- Container images for `api` and `web`, with multi-stage builds, a non-root user and health checks.
- **Database migrations** with `prisma migrate deploy` as a one-off release step before the new API version starts.
- **Graceful shutdown.** NestJS shutdown hooks drain in-flight requests and BullMQ workers.
- **Optional AWS demo** (Terraform, **never applied without explicit approval**): a small ECS Fargate service, RDS PostgreSQL with encryption at rest, Secrets Manager, CloudWatch logs, least-privilege IAM. Synthetic data only.
- Backup and recovery and an incident runbook will be added alongside the AWS design.

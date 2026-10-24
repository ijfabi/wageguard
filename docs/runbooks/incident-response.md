# Incident response

A short guide for when something goes wrong. It assumes the AWS layout in `infra/aws`, which hasn't actually been deployed. The local equivalents are noted where they differ.

## First five minutes

1. **Is it up?** `GET /api/v1/health` says whether the API process is alive, and `GET /api/v1/ready` says whether it can reach the database. A healthy API that isn't ready points at the database.
2. **What changed?** Most incidents follow a deployment. Check the ECS service's events and the last task definition revision. Locally, check `git log` and `docker compose ps`.
3. **What are the errors?** Every error response carries a `correlationId`. Search the API logs for it (CloudWatch log group `/ecs/wageguard-demo/api`, or `docker compose logs api` locally). Logs never contain request bodies or credentials. If telemetry is on, the log line's `trace_id` opens the full trace ([observability](../observability.md)).
4. **Write down the time** the problem started. Every recovery option below depends on it.

## Common situations

### The database is unreachable

The API answers `503 SERVICE_UNAVAILABLE` with `Retry-After`, `/ready` returns 503, and no requests hang for more than about 3 seconds. Check the RDS instance's status and events. When the database comes back, the API reconnects by itself, with no restart needed. Benchmark E measured audits completing again 1.35 seconds after a stopped database came back ([performance](../performance.md)). Clients that retry with the same `Idempotency-Key` can't create duplicates, so retries are safe.

### The API keeps crashing or failing its health check

ECS restarts failed tasks, and the deployment circuit breaker rolls back a deployment whose tasks never become healthy. If the crash started with a release, roll back by pointing the service at the previous task definition revision. If it didn't, look for the first error in the logs after a restart. Configuration errors name the variable at fault, and they never print its value.

### Bad data, or a mistake in a rule set

Completed audits can't be edited, by design. If a rule-set value turns out to be wrong, never edit the published file: CI will refuse anyway, because of the fingerprint check. Publish a corrected revision (`r2`), then let people re-run the affected audits ([ADR 0003](../adr/0003-versioned-immutable-rule-sets.md)). Every audit records the rule set and fingerprint it used, so a single query finds the ones affected:

```sql
SELECT count(*) FROM audits WHERE rule_set_fingerprint = '<fingerprint of the faulty version>';
```

If rows were damaged some other way, restore to a point before the damage ([backup and recovery](backup-and-recovery.md)).

### Suspected security incident

1. **Preserve evidence before changing anything.** Export the relevant CloudWatch logs and note the `audit_events` rows (sign-ins, failed sign-ins, exports and deletions, recorded without personal details).
2. **Sign everyone out** if sessions might be compromised: `DELETE FROM sessions;`. Session tokens are stored only as hashes, so a database leak alone doesn't expose them.
3. **Rotate the database password.** Change it in RDS, update both database URL secrets, and redeploy.
4. **Check dependencies and images.** Check the dependency audit and Trivy results in CI for anything newly published ([security](../security.md)).
5. **Tell people.** If personal information may have been exposed, the Notifiable Data Breaches scheme may apply. The demo deployment is designed to hold synthetic data only, which is one reason it must never be given real payslips.

## Afterwards

Write down what happened, how it was noticed, how long each step took, and what would have caught it sooner. Then turn the most useful lesson into a test, an alert, or a change to this runbook.

# Backup and recovery

Everything WageGuard knows lives in PostgreSQL: accounts, shifts, payslips and audits. The award rules ship with the code, so there's nothing else to back up. Two things make recovery simpler than usual. Completed audits are never updated, so a backup can't catch one half-changed. And every audit stores its own inputs, so a restored audit can be checked by running it again.

## Locally (Docker Compose)

Take a backup:

```bash
docker compose exec -T postgres pg_dump -U wageguard -d wageguard -Fc -f /tmp/wageguard.dump
docker compose cp postgres:/tmp/wageguard.dump ./wageguard-$(date +%Y%m%d).dump
```

Restore it into a fresh database:

```bash
docker compose cp ./wageguard-YYYYMMDD.dump postgres:/tmp/wageguard.dump
docker compose exec -T postgres psql -U wageguard -d postgres -c "CREATE DATABASE wageguard_restored"
docker compose exec -T postgres pg_restore -U wageguard -d wageguard_restored --no-owner --exit-on-error /tmp/wageguard.dump
```

Then point `DATABASE_URL` at the restored database, or rename it into place while the API is stopped. Don't run `migrate deploy` against a restore first: the dump already contains the migration history.

### Tested on 2026-10-25

The steps above were run against the local development database. The dump held 120 users, 96 audits, 110 findings and 223 shifts (171 KB), and dumping and restoring took about 0.4 seconds each. The restored database had the same row counts and both migrations recorded. Its shift no-overlap constraint was in place, and it still refused an `UPDATE` to a completed audit with `wageguard: completed audit records are immutable`. Those triggers and constraints are the parts most likely to go missing in a careless restore, so check them every time:

```sql
SELECT count(*) FROM pg_constraint WHERE conname = 'shifts_no_overlap';            -- expect 1
UPDATE audits SET shift_count = shift_count WHERE id = (SELECT id FROM audits LIMIT 1);  -- expect an error
```

## On AWS (infra/aws, not deployed)

The Terraform turns on RDS automated backups, kept for 7 days (`db_backup_retention_days`), with point-in-time recovery to any second in that window. The backup window is 02:00 to 03:00 Sydney time. Deleting the database is blocked, and a final snapshot is taken if deletion protection is ever turned off.

To recover from bad data or an accidental change, restore to a new instance at a point just before the problem:

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier wageguard-demo \
  --target-db-instance-identifier wageguard-demo-restored \
  --restore-time 2026-10-25T03:15:00Z \
  --db-subnet-group-name wageguard-demo \
  --vpc-security-group-ids <db security group id>
```

Check the restored instance (counts, the constraint, the immutability trigger). Then update both database URL secrets in Secrets Manager to its endpoint and force a new deployment of the API service. The old instance stays untouched until you're sure, which also keeps the evidence of what went wrong.

RDS backups stay in the same account and region. A real deployment holding real data would also need copies in another region or account, and a scheduled restore test. Neither is set up, because this deployment has never run and holds synthetic data only.

## What recovery doesn't cover

- Sessions are in the database too, so a restore to an earlier point signs everyone in that window out, or back in. Clearing the `sessions` table after a restore is a sensible precaution.
- The audit event log is restored along with everything else, so events after the restore point are lost. Keep the CloudWatch logs from the incident before restoring.

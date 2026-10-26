# Data model

## Domain types

These live in `packages/domain` and know nothing about the database.

| Type                                      | What it represents                                                                                     | Rules it enforces                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `Money`                                   | Australian dollars to the cent                                                                         | Built only from strings, rounded only on request (`fromDecimal`), never `-0`                                      |
| `Decimal`                                 | Exact decimal arithmetic (its own `decimal.js` instance, 50 significant digits)                        | Every rounding names its mode                                                                                     |
| `LocalDate`, `LocalTime`, `LocalDateTime` | Dates and times as written on a timesheet, with no time zone                                           | Minute precision and strict formats                                                                               |
| `Instant`                                 | A moment in UTC, as epoch milliseconds                                                                 | Safe integers only                                                                                                |
| `TimeZone`                                | An IANA zone such as `Australia/Sydney`                                                                | Rejects abbreviations and fixed offsets. Missing and repeated times around daylight saving are handled explicitly |
| `Interval`                                | A span from a start up to, but not including, an end                                                   | Never empty                                                                                                       |
| `EmploymentTerms`                         | Award, classification, contract type, time zone, the person's declarations, part-time guaranteed hours | Guaranteed minutes only for part-time, between 0 and 1,440 a day                                                  |
| `ShiftRecord`, `ResolvedShift`            | A shift as written, and the same shift placed in UTC                                                   | At most 24 hours. Breaks sit inside the shift and don't overlap                                                   |
| `PayPeriod`                               | A run of whole dates, inclusive                                                                        | 1 to 31 days                                                                                                      |
| `Payslip`, `PayslipLine`                  | What the person was actually paid                                                                      | Lines add up to the gross, nothing is negative, at most 100 lines                                                 |

The calculation's output types are in `packages/calculation-engine/src/result.ts` and `reconcile.ts`.

## Database

The schema is `apps/api/prisma/schema.prisma`. A few constraints Prisma can't express are written by hand at the end of the first migration (`apps/api/prisma/migrations/*_init/migration.sql`). Primary keys are UUIDv7, which sort by creation time and keep indexes tidy. Timestamps are `timestamptz(3)` in UTC. Money is `numeric(14,2)`.

The diagram shows every table and column. `PK` is the primary key, `FK` a foreign key and `UK` part of a unique constraint. Enum columns are PostgreSQL enum types, listed after the diagram.

```mermaid
erDiagram
  users ||--o{ sessions : "has (CASCADE)"
  users ||--o{ email_tokens : "has (CASCADE)"
  users ||--o{ recovery_codes : "has (CASCADE)"
  users ||--o{ idempotency_keys : "has (CASCADE)"
  audits ||--o{ idempotency_keys : "produced (CASCADE)"
  users ||--o{ employments : "owns (CASCADE)"
  employments ||--o{ shifts : "(id, user_id) CASCADE"
  shifts ||--o{ shift_breaks : "has (CASCADE)"
  employments ||--o{ payslips : "(id, user_id) CASCADE"
  payslips ||--o{ payslip_lines : "has (CASCADE)"
  employments ||--o{ audits : "(id, user_id) NO ACTION"
  payslips ||--o{ audits : "(id, user_id) NO ACTION"
  audits ||--o{ audit_findings : "has (CASCADE)"
  users |o--o{ audit_events : "SET NULL"

  users {
    uuid id PK "UUIDv7"
    varchar_254 email UK "lower-cased"
    text password_hash "Argon2id"
    timestamptz created_at
    timestamptz email_verified_at "null until confirmed"
    text totp_secret "AES-256-GCM, null unless set up"
    timestamptz totp_enabled_at
    int totp_last_step "stops code replay"
  }
  sessions {
    uuid id PK
    uuid user_id FK
    char_64 token_hash UK "SHA-256 of the token"
    timestamptz created_at
    timestamptz expires_at
    boolean verified "false while a two-step code is owed"
    int two_factor_attempts
    timestamptz last_seen_at
    varchar_80 device "browser and platform only"
  }
  email_tokens {
    uuid id PK
    uuid user_id FK
    EmailTokenPurpose purpose
    char_64 token_hash UK "SHA-256 of the link token"
    timestamptz created_at
    timestamptz expires_at
    timestamptz used_at
  }
  recovery_codes {
    uuid id PK
    uuid user_id FK "UK with code_hash"
    char_64 code_hash "HMAC-SHA-256"
    timestamptz used_at
  }
  idempotency_keys {
    uuid user_id PK
    varchar_100 key PK
    char_64 request_hash
    uuid audit_id FK
    timestamptz created_at
    timestamptz expires_at "24 hours"
  }
  rate_limit_buckets {
    varchar_200 key PK "throttler hash, never an address"
    timestamptz window_end
    int hits
  }
  employments {
    uuid id PK
    uuid user_id FK "UK with id"
    varchar_100 label
    varchar_20 award_code "MA000004"
    varchar_100 classification_code
    EmploymentType employment_type
    varchar_64 time_zone "IANA zone"
    AwardCoverage award_coverage
    EnterpriseAgreement enterprise_agreement
    AgeBand age_band
    ShiftworkerStatus shiftworker
    jsonb part_time_guaranteed_minutes "part-time only"
    AustralianState state "public holiday calendar"
    date date_of_birth "junior rates"
    date employment_start_date "age-20 rule"
    SpanException span_exception
    boolean school_student
    boolean reduced_break_agreed
    boolean averaging_roster
    boolean baking_production
    boolean apprentice
    boolean launders_special_clothing
    boolean appointed_first_aider
    boolean holds_liquor_licence
    boolean broken_hill
    timestamptz created_at
    timestamptz updated_at
  }
  shifts {
    uuid id PK
    uuid user_id FK
    uuid employment_id FK
    char_16 start_local "as entered"
    char_16 end_local "as entered"
    smallint start_utc_offset_minutes "DST choice"
    smallint end_utc_offset_minutes "DST choice"
    date start_date "pay-period attribution"
    timestamptz start_at "resolved UTC"
    timestamptz end_at "resolved UTC"
    int version "optimistic locking"
    timestamptz created_at
    timestamptz updated_at
  }
  shift_breaks {
    uuid id PK
    uuid shift_id FK "UK with position"
    smallint position
    BreakKind kind
    char_16 start_local
    char_16 end_local
    smallint start_utc_offset_minutes
    smallint end_utc_offset_minutes
  }
  payslips {
    uuid id PK
    uuid user_id FK "UK with id"
    uuid employment_id FK
    date period_start
    date period_end
    numeric_14_2 gross_pay
    timestamptz created_at
  }
  payslip_lines {
    uuid id PK
    uuid payslip_id FK "UK with position"
    smallint position
    PayslipLineCategory category
    varchar_200 description
    numeric_14_2 amount
  }
  audits {
    uuid id PK
    uuid user_id FK "UK with idempotency_key"
    uuid employment_id FK
    uuid payslip_id FK
    varchar_100 idempotency_key
    char_64 request_hash
    AuditStatus status
    date period_start
    date period_end
    FindingStatus finding_status
    CalculationStatus calculation_status
    numeric_14_2 expected_amount "null if not calculated"
    numeric_14_2 reported_amount
    numeric_14_2 difference
    int shift_count
    varchar_64 rule_set_version
    char_64 rule_set_fingerprint
    varchar_20 engine_version
    char_64 input_hash
    jsonb input_snapshot
    jsonb payslip_snapshot
    jsonb result
    jsonb reconciliation
    timestamptz calculated_at
    timestamptz created_at
  }
  audit_findings {
    uuid id PK
    uuid audit_id FK "UK with position"
    smallint position
    varchar_100 code
    varchar_20 scope
    FindingStatus status
    text explanation
    numeric_14_2 expected_amount
    numeric_14_2 reported_amount
    numeric_14_2 difference
    text_array shift_ids
    text_array clause_refs
    text_array evidence_refs
    text next_step
  }
  audit_events {
    uuid id PK
    uuid user_id FK "nullable"
    AuditEventType type
    timestamptz occurred_at
    jsonb metadata "no personal data"
  }
```

| Enum                  | Values                                                                                                                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmploymentType`      | `CASUAL`, `PART_TIME`, `FULL_TIME`                                                                                                                                                                                                                                                                                |
| `AwardCoverage`       | `CONFIRMED`, `UNSURE`                                                                                                                                                                                                                                                                                             |
| `EnterpriseAgreement` | `NONE`, `APPLIES`, `UNSURE`                                                                                                                                                                                                                                                                                       |
| `AgeBand`             | `ADULT_21_PLUS`, `UNDER_21`, `UNSURE`                                                                                                                                                                                                                                                                             |
| `ShiftworkerStatus`   | `NO`, `YES`, `UNSURE`                                                                                                                                                                                                                                                                                             |
| `AustralianState`     | `ACT`, `NSW`, `NT`, `QLD`, `SA`, `TAS`, `VIC`, `WA`                                                                                                                                                                                                                                                               |
| `SpanException`       | `NONE`, `NEWSAGENCY`, `VIDEO_SHOP`, `EXTENDED_TRADING`                                                                                                                                                                                                                                                            |
| `EmailTokenPurpose`   | `VERIFY_EMAIL`, `RESET_PASSWORD`                                                                                                                                                                                                                                                                                  |
| `BreakKind`           | `UNPAID_MEAL`, `PAID_REST`                                                                                                                                                                                                                                                                                        |
| `PayslipLineCategory` | `HOURS_WORKED`, `OVERTIME`, `ALLOWANCE`, `LEAVE`, `OTHER`                                                                                                                                                                                                                                                         |
| `AuditStatus`         | `COMPLETED`                                                                                                                                                                                                                                                                                                       |
| `FindingStatus`       | `MATCHED`, `POTENTIAL_UNDERPAYMENT`, `POTENTIAL_OVERPAYMENT`, `INCOMPLETE_DATA`, `UNSUPPORTED_SCENARIO`, `REVIEW_REQUIRED`                                                                                                                                                                                        |
| `CalculationStatus`   | `CALCULATED`, `REVIEW_REQUIRED`, `UNSUPPORTED_SCENARIO`, `INCOMPLETE_DATA`                                                                                                                                                                                                                                        |
| `AuditEventType`      | `REGISTERED`, `EMAIL_VERIFIED`, `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `TWO_FACTOR_FAILED`, `LOGGED_OUT`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET`, `PASSWORD_CHANGED`, `TWO_FACTOR_ENABLED`, `TWO_FACTOR_DISABLED`, `SESSIONS_REVOKED`, `SHIFTS_IMPORTED`, `AUDIT_CREATED`, `REPORT_EXPORTED`, `ACCOUNT_DELETED` |

Mermaid can't show types with commas or brackets, so `varchar_254` means `varchar(254)`, `numeric_14_2` means `numeric(14,2)` and `text_array` means `text[]`.

## Constraints outside the diagram

These are written by hand in the migrations, because Prisma can't express them:

| Constraint                                                             | Table                               | What it stops                                                                                                                                 |
| ---------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Exclusion constraint on `(employment_id, tstzrange(start_at, end_at))` | `shifts`                            | Two overlapping shifts for the same job                                                                                                       |
| `CHECK (end_at > start_at)`, `CHECK (version >= 1)`                    | `shifts`                            | A shift that ends before it starts, and a bad version number                                                                                  |
| `CHECK (period_end >= period_start)`, `CHECK (gross_pay >= 0)`         | `payslips`                          | Backwards periods and negative pay                                                                                                            |
| `CHECK (amount >= 0)`                                                  | `payslip_lines`                     | Negative lines                                                                                                                                |
| `CHECK (period_end >= period_start)`                                   | `audits`                            | A backwards audit period                                                                                                                      |
| Immutability trigger (blocks UPDATE and DELETE)                        | `audits`, `audit_findings`          | Any change to a completed audit. The only exception is account deletion, which sets the transaction-local `wageguard.allow_audit_delete` flag |
| Owner-change trigger                                                   | `employments`, `shifts`, `payslips` | Moving a row to a different `user_id`                                                                                                         |
| `CHECK (date_of_birth < employment_start_date)`                        | `employments`                       | A job that starts before the person was born                                                                                                  |

Child rows point at their parent with a composite key that includes `user_id`. That way the database itself refuses a shift, payslip or audit that belongs to a different user from its employment. Triggers stop the owner of a row from ever changing.

**`users`** have a unique, lower-cased `email`. Accounts that existed before email confirmation were marked confirmed by the migration.

**`sessions`** store only a SHA-256 hash of each token (unique), with indexes on `user_id` and `expires_at`. A session with `verified = false` is waiting for a two-step code and can only be used to enter it.

**`email_tokens`**, **`recovery_codes`** and **`rate_limit_buckets`** hold only hashes, never a token, code or client address ([ADR 0017](adr/0017-account-security.md), [ADR 0018](adr/0018-shared-rate-limits-and-expiring-idempotency-keys.md)).

**`employments`** have a unique `(id, user_id)` pair for the composite keys above, and an index on `(user_id, created_at)`. They can be edited; audits keep a copy of the terms they were calculated with. `state` is null for employments created before it was recorded.

**`shifts`** keep the times exactly as entered, the local `start_date` that decides which pay period they belong to, and the resolved UTC `start_at` and `end_at`. A `version` column supports safe concurrent edits. An exclusion constraint stops two shifts for the same job from overlapping, and a CHECK makes sure each one ends after it starts. They're indexed on `(employment_id, start_date)` and `(user_id, start_at)`.

**`shift_breaks`** are unique per `(shift_id, position)`.

**`payslips`** check that the period is in order and the gross isn't negative. They're indexed on `(employment_id, period_start)`, and on `(user_id, created_at DESC, id)` for the payslip history page.

**`payslip_lines`** are unique per `(payslip_id, position)`, with non-negative amounts.

**`audits`** keep the `idempotency_key` they were created with. **`idempotency_keys`** decides whether a key is in use: one row per user and key, expiring 24 hours after its audit, which is what makes retries safe. Each one stores a snapshot of everything used: the input, the payslip, the result, the reconciliation, the rule-set fingerprint, the input hash and the engine version. A trigger blocks UPDATE and DELETE. They're indexed on `(user_id, created_at DESC, id)` for history, and on `(user_id, finding_status, created_at DESC, shift_count, difference)`. That second index serves both the filtered history and the dashboard's totals, which can be read from it without touching the table ([ADR 0015](adr/0015-query-shape-indexes-and-fail-fast.md)).

**`audit_findings`** are unique per `(audit_id, position)` and protected by the same trigger.

**`audit_events`** is a security log with no personal details, indexed on `(user_id, occurred_at)`.

The reasoning behind these rules is in [ADR 0010](adr/0010-audits-idempotency-and-immutability.md) and [ADR 0011](adr/0011-contract-first-api-and-database-integrity.md). The indexes were checked with `EXPLAIN ANALYZE` at up to 50,000 audits in Benchmark C ([performance](performance.md)).

# Data model

## Domain model (implemented, `packages/domain`)

| Type                                      | Purpose                                                                       | Key invariants                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Money`                                   | AUD at cent precision                                                         | String construction only; explicit rounding via `fromDecimal`; no `-0`     |
| `Decimal`                                 | Isolated `decimal.js` clone, 50 significant digits                            | Rounding modes named explicitly                                            |
| `LocalDate`, `LocalTime`, `LocalDateTime` | Wall-clock values with no zone                                                | Minute precision; strict formats                                           |
| `Instant`                                 | UTC epoch milliseconds                                                        | Safe integers                                                              |
| `TimeZone`                                | IANA zone                                                                     | Rejects abbreviations and fixed offsets; DST gaps and repeats are explicit |
| `Interval`                                | `[start, end)`                                                                | Non-empty; half-open                                                       |
| `EmploymentTerms`                         | Award, classification, type, zone, declarations, part-time guaranteed minutes | Guaranteed minutes only for part-time employment, 0 to 1,440               |
| `ShiftRecord`, `ResolvedShift`            | Timesheet shift and its UTC placement                                         | At most 24 h; breaks inside the shift and not overlapping                  |
| `PayPeriod`                               | Inclusive local dates                                                         | 1 to 31 days                                                               |
| `Payslip`, `PayslipLine`                  | Reported pay                                                                  | Lines sum to gross; non-negative; at most 100 lines                        |

Calculation and reconciliation output types are in `packages/calculation-engine/src/result.ts` and `reconcile.ts`.

## Persistence model (planned, Phase 2)

Planned PostgreSQL tables:

| Table                       | Notes                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`, `sessions`         | Identity and authentication                                                                                                                                                  |
| `employments`               | Owned by a user                                                                                                                                                              |
| `shifts`, `shift_breaks`    | Owned through the employment; optimistic `version` column                                                                                                                    |
| `payslips`, `payslip_lines` |                                                                                                                                                                              |
| `audits`                    | Unique `(user_id, idempotency_key)`; stores an immutable input snapshot, the input hash, rule-set version and fingerprint, engine version and the result JSON once completed |
| `audit_findings`            |                                                                                                                                                                              |
| `audit_events`              | Sensitive-action log                                                                                                                                                         |

Foreign keys enforce ownership chains. Completed audits are made immutable with a database trigger as well as in application code.

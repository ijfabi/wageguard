# REST API

**Status:** implemented and covered by 63 integration tests against real PostgreSQL.

- All routes are under `/api/v1`.
- The machine-readable contract is the OpenAPI 3.1 document at `GET /api/v1/openapi.json`. It is generated from the Zod schemas in `packages/api-contracts` ([ADR 0011](adr/0011-contract-first-api-and-database-integrity.md)).
- A test fails if a route is added without being documented.

## Authentication

- **Sign in.** `POST /auth/register` or `POST /auth/login` sets an HTTP-only, `SameSite=Strict` session cookie (`wg_session`, or `__Host-wg_session` when Secure).
- **Access.** Every route requires that cookie except the ones listed as public below.
- **Ownership.** Resources owned by another user return `404`, exactly like missing ones.
- **Browser origin check.** State-changing requests with a foreign `Origin` or `Sec-Fetch-Site: cross-site` get `403 FORBIDDEN_ORIGIN`.

See [ADR 0009](adr/0009-authentication-and-sessions.md).

## Endpoints

| Method    | Path                               | Notes                                                                                                                                      |
| --------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| POST      | `/auth/register`                   | Public, auth rate limit. Password at least 12 characters. 409 if the email exists.                                                         |
| POST      | `/auth/login`                      | Public, auth rate limit. Same 401 message for an unknown email and a wrong password.                                                       |
| POST      | `/auth/logout`                     | Revokes the session server-side.                                                                                                           |
| GET       | `/auth/me`                         | Current user.                                                                                                                              |
| DELETE    | `/auth/me`                         | Body `{ password }`. Deletes the account and all data, including audits.                                                                   |
| POST, GET | `/employments`, `/employments/:id` | Owner-scoped. `timeZone` must be an IANA zone.                                                                                             |
| POST      | `/shifts`                          | Wall-clock times plus breaks; validated with the domain rules (DST gaps and repeats, breaks inside the shift). 409 `SHIFT_OVERLAP`.        |
| POST      | `/shifts/import?employmentId=`     | `Content-Type: text/csv`, at most 256 KiB and 500 rows, header `start,end,meal_start,meal_end`. All or nothing; errors name the CSV line.  |
| GET       | `/shifts`                          | Filters `employmentId`, `from`, `to`; `sort=start_asc` or `start_desc`; cursor pagination.                                                 |
| GET       | `/shifts/:id`                      |                                                                                                                                            |
| PATCH     | `/shifts/:id`                      | Full replacement of times and breaks with `version`. Stale version: 409 `VERSION_CONFLICT`. `employmentId` cannot change.                  |
| POST, GET | `/payslips`, `/payslips/:id`       | Lines must sum exactly to gross.                                                                                                           |
| POST      | `/audits`                          | **`Idempotency-Key` header required.** Pay period is taken from the payslip. 201 when new; 200 plus `Idempotent-Replayed: true` on replay. |
| GET       | `/audits`                          | Filter `findingStatus`; `sort=created_desc` or `created_asc`; cursor pagination.                                                           |
| GET       | `/audits/:id`                      | Summary, findings, notes, assumptions, rule-set fingerprint, input hash.                                                                   |
| GET       | `/audits/:id/lines`                | Pay lines and the shift-by-shift breakdown.                                                                                                |
| GET       | `/audits/:id/report`               | Downloadable JSON evidence report (`Content-Disposition: attachment`). PDF is planned.                                                     |
| GET       | `/rules/versions`                  | Public. Published rule sets and fingerprints.                                                                                              |
| GET       | `/health`, `/ready`                | Public. Liveness, and readiness (database reachable).                                                                                      |
| GET       | `/openapi.json`                    | Public.                                                                                                                                    |

## Pagination

- **Request.** `?limit=1..100` (default 25) and `?cursor=<opaque>`.
- **Response.** `{ "items": [...], "nextCursor": "..." | null }`.
- **Cursors** are keyset cursors (sort key plus id), so pages stay stable while rows are inserted. Malformed cursors return `422 INVALID_CURSOR`.

## Idempotency guarantees (`POST /audits`)

1. At most one audit is persisted per user and key, including under concurrent requests. This is enforced by a unique index.
2. A repeated key with the same request returns the stored audit unchanged.
3. A repeated key with a different request returns `422 IDEMPOTENCY_KEY_REUSED`.
4. Keys are 8 to 100 characters of `[A-Za-z0-9_-]` (a UUID works), scoped per user, and do not expire.

## Errors

Every error has the same shape. `correlationId` equals the `x-correlation-id` response header:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Input is not valid",
    "issues": [{ "code": "NONEXISTENT_LOCAL_TIME", "path": "shift.start", "message": "..." }],
    "correlationId": "..."
  }
}
```

| Status | Codes                                                            |
| ------ | ---------------------------------------------------------------- |
| 400    | `VALIDATION_FAILED` (malformed JSON), `IDEMPOTENCY_KEY_REQUIRED` |
| 401    | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`                         |
| 403    | `FORBIDDEN_ORIGIN`                                               |
| 404    | `NOT_FOUND`                                                      |
| 409    | `EMAIL_TAKEN`, `SHIFT_OVERLAP`, `VERSION_CONFLICT`               |
| 413    | `PAYLOAD_TOO_LARGE` (JSON over 512 KiB, CSV over 256 KiB)        |
| 415    | `UNSUPPORTED_MEDIA_TYPE`                                         |
| 422    | `VALIDATION_FAILED` (with issues), `IDEMPOTENCY_KEY_REUSED`      |
| 429    | `RATE_LIMITED`                                                   |
| 503    | `NOT_READY`                                                      |
| 500    | `INTERNAL_ERROR` (details only in server logs)                   |

Domain issue codes inside `issues` come from `packages/domain/src/errors.ts`. Calculation issue codes inside audit findings come from `packages/calculation-engine/src/issues.ts`.

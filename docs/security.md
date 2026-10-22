# Security and threat model

Status: initial model, written before the API exists. The controls marked **Planned** are design commitments for Phase 2 and later, not implemented features.

## Assets

- Employee personal and pay data: shifts, payslip amounts, employment details.
- Authentication material: passwords and session cookies.
- Integrity of rule sets and completed audit snapshots, since a tampered rule silently changes every result.
- Uploaded files (CSV now; PDF possibly later).

## Trust boundaries

Browser → API (untrusted input), API → PostgreSQL, API → Redis/BullMQ, CI → container registry and AWS (optional).

## Threats and controls

| Threat (STRIDE)                                       | Control                                                                                                                                   | Status                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Tampering with rule data                              | Zod schema plus semantic validation; SHA-256 fingerprints of published rule sets checked at load and in CI; deep-frozen at runtime        | Implemented                                    |
| Tampering with calculation inputs or results          | Input snapshot hash and rule-set fingerprint stored with each result; completed audits immutable                                          | Hash implemented; storage planned              |
| Malformed or hostile input (injection, huge payloads) | Strict Zod schemas (unknown keys rejected), string length caps, at most 200 shifts and 10 breaks per period; Prisma parameterised queries | Engine limits implemented; HTTP limits planned |
| Spoofing (account takeover)                           | Maintained auth library with argon2id hashing, HTTP-only Secure SameSite cookies, rate-limited login                                      | Planned                                        |
| Broken object-level authorisation                     | Every repository query scoped by owner `userId`; cross-user tests                                                                         | Planned                                        |
| Repudiation                                           | Audit log of sensitive actions (login, export, deletion)                                                                                  | Planned                                        |
| Information disclosure in logs                        | Structured logging with redaction of payslip amounts, tokens and personal fields                                                          | Planned                                        |
| CSV upload abuse                                      | Size cap, row cap, strict column schema, no formula evaluation, not stored after parsing unless the user chooses                          | Planned                                        |
| Denial of service                                     | Rate limiting, request size limits, bounded engine work per request                                                                       | Partially (engine bounds)                      |
| Supply chain                                          | Exact version pins, lockfile, `pnpm audit` in CI, gitleaks secret scan; container scanning planned                                        | Partially                                      |
| Misleading output (product safety)                    | `REVIEW_REQUIRED` and `UNSUPPORTED_SCENARIO` instead of guesses; no green "verified" state for unreviewed rules                           | Implemented in engine                          |

## Rules for this repository

- Synthetic data only. Never commit or load real employee data.
- Secrets live in environment variables (`.env` is git-ignored; `.env.example` holds placeholders).
- No calculation path calls an external service or an AI provider.

OWASP ASVS will be used as the checklist when the API is built (Phase 2). The required security test cases (BOLA, malformed CSV, oversized files, cross-user access, duplicate and concurrent audits, invalid dates, injection) are tracked in the [checklist](implementation-checklist.md).

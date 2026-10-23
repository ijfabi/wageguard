# Security and threat model

OWASP ASVS is used as the engineering checklist. This page lists only controls that exist and are tested, plus clearly labelled gaps.

## Assets

- Employee personal and pay data: shifts, payslip amounts, employment details.
- Authentication material: password hashes and session tokens.
- Integrity of rule sets and completed audit snapshots, since tampering silently changes results.
- Uploaded files (CSV timesheets).

## Trust boundaries

Browser → API (untrusted input) → PostgreSQL. CI → GitHub-hosted runners. Redis is provisioned but not yet used.

## Threats and controls

| Threat (STRIDE)                              | Control                                                                                                                                                                                 | Status and evidence                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Spoofing: credential stuffing or brute force | argon2id (m=19 MiB, t=2, p=1); stricter auth rate limit; identical message and similar timing for unknown email and bad password                                                        | Implemented; `auth.test.ts`, `platform.test.ts` (429)                                                           |
| Spoofing: session theft                      | 256-bit random tokens, only SHA-256 stored; HttpOnly, SameSite=Strict, Secure plus `__Host-` in production; server-side revocation; fixed TTL                                           | Implemented; `auth.test.ts` (stolen cookie fails after logout, expired session rejected)                        |
| CSRF                                         | SameSite=Strict, plus a global origin guard (`Origin` allow-list and `Sec-Fetch-Site`)                                                                                                  | Implemented; `platform.test.ts`                                                                                 |
| Broken object-level authorisation            | Every query scoped by `user_id`; 404 for others' resources; composite ownership FKs; ownership-immutable triggers                                                                       | Implemented; `security.test.ts` covers every object route, list leakage, cross-user writes and database bypass  |
| Tampering with rule data                     | Zod plus semantic validation; SHA-256 fingerprints checked at load and in CI; deep-frozen at runtime                                                                                    | Implemented                                                                                                     |
| Tampering with completed audits              | Immutable snapshot plus a trigger blocking UPDATE and DELETE; deletion only via transaction-local flag in account deletion                                                              | Implemented; `audits.test.ts`                                                                                   |
| Duplicate or replayed audit submissions      | `Idempotency-Key` with a unique index; request-hash check                                                                                                                               | Implemented; 10-way concurrency test                                                                            |
| Injection                                    | Prisma parameterised queries; strict Zod schemas (unknown keys rejected); allow-listed sort keys; validated cursors                                                                     | Implemented; `security.test.ts` (SQL and script payloads, sort, filter and cursor injection)                    |
| Malformed or hostile CSV                     | 256 KiB body cap, 500-row cap, 1 KiB record cap, exact header, every cell pattern-validated (formula payloads rejected), all or nothing                                                 | Implemented; `shifts.test.ts` (11 malformed cases)                                                              |
| Denial of service                            | Rate limits; JSON body cap 512 KiB; bounded engine work (at most 200 shifts and 10 breaks); page size at most 100                                                                       | Implemented                                                                                                     |
| Information disclosure in errors             | Single error body; 500s are generic with details only in logs; framework header removed                                                                                                 | Implemented; `platform.test.ts`                                                                                 |
| Information disclosure in logs               | Bodies never logged; cookie and authorization headers redacted; query strings dropped; event metadata holds ids and codes only                                                          | Implemented; `auth.test.ts` checks events contain no email                                                      |
| Clickjacking and content injection           | helmet: CSP `default-src 'none'; frame-ancestors 'none'`, `nosniff`, `X-Frame-Options`                                                                                                  | Implemented                                                                                                     |
| Cross-site scripting (web)                   | Per-request nonce CSP: `script-src 'self' 'nonce-…' 'strict-dynamic'`, no `'unsafe-inline'` or `'unsafe-eval'` in production; React escaping; no `dangerouslySetInnerHTML`              | Implemented; `access.spec.ts` checks the header, script nonces, nonce rotation and zero violations across pages |
| Open redirect after sign-in                  | `?next=` accepted only as a same-site path (control characters, `//` and backslashes rejected)                                                                                          | Implemented; unit and E2E tested                                                                                |
| Credentials in URLs                          | Sign-in, sign-up and account deletion forms use `method="post"`, so a submission before JavaScript loads never puts credentials in the URL                                              | Implemented; E2E test with JavaScript disabled                                                                  |
| Information disclosure in telemetry          | Opt-in OpenTelemetry; allow-listed custom attributes; redacting span processor (client address, user agent, query strings); no headers, bodies or SQL parameters                        | Implemented; `telemetry.test.ts`; manual check against a collector ([observability](observability.md))          |
| Exported reports                             | PDF and JSON built only from the owner's immutable snapshot; object-level authorisation; `Cache-Control: no-store` on the PDF; export recorded as an event                              | Implemented; BOLA sweep includes the PDF route                                                                  |
| Repudiation                                  | `audit_events`: register, login success and failure, logout, import, audit created, report export, account deletion                                                                     | Implemented                                                                                                     |
| Supply chain                                 | Exact version pins and lockfile; `pnpm audit --audit-level high` in CI; gitleaks secret scan over full history; Trivy image scan (fixable HIGH/CRITICAL); actions pinned to commit SHAs | Implemented in CI                                                                                               |
| Secrets                                      | Environment only; `.env` git-ignored; startup validation reports variable names, never values                                                                                           | Implemented                                                                                                     |
| Data deletion                                | `DELETE /auth/me` with password re-entry removes all owned rows, including audits                                                                                                       | Implemented; `security.test.ts`                                                                                 |
| Misleading output                            | `REVIEW_REQUIRED` and `UNSUPPORTED_SCENARIO` instead of guesses; no `MATCHED` for partial calculations                                                                                  | Implemented in engine and API                                                                                   |

## Known gaps

- **Email enumeration.** Registration reveals whether an email exists (`409 EMAIL_TAKEN`). This is mitigated by the auth rate limit; there is no email verification flow.
- **Rate-limit scope.** Rate-limit state is in process memory: correct for one instance only.
- **Encryption at rest.** This depends on the hosting platform (for example RDS encryption), and no uploaded files are stored. Nothing is deployed yet.
- **No MFA, password reset or account lockout.** Brute force is slowed by rate limiting only.
- **Web CSP styles.** `style-src` allows `'unsafe-inline'` because UI libraries inject styles at runtime. Scripts are nonce-only (see the controls table).

## Dependency exceptions

`pnpm audit --audit-level high` runs in CI. Each accepted advisory is listed in `pnpm-workspace.yaml` (`auditConfig.ignoreGhsas`) and justified here.

| Advisory                                                                       | Package and path                                                          | Why it is accepted                                                                                                                                                                          | Revisit when                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| GHSA-vfj7-8cjw-p6xm (HIGH, denial of service via deeply nested brace patterns) | `braces` ≤ 3.0.3, via `@next/eslint-plugin-next → fast-glob → micromatch` | No patched version exists. Reachable only from the ESLint plugin at lint time, on file globs written by us, never from user input. Not present in either runtime image (Trivy scans in CI). | A patched `braces`, or a plugin release that no longer depends on it |

## Rules for this repository

- Synthetic data only. Never commit or load real employee data.
- No calculation path calls an external service or an AI provider.

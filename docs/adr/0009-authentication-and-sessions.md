# ADR 0009: Server-side sessions with argon2id, no custom cryptography

- Status: Accepted
- Date: 2026-10-22

## Context

The API holds personal pay data. The brief requires secure authentication with a maintained solution, HTTP-only cookies, CSRF protection and rate limiting, and no home-made cryptography.

## Decision

**Passwords**

- Hashed with argon2id via the maintained `argon2` binding, using the OWASP minimum parameters: m = 19 MiB, t = 2, p = 1.
- Login verifies against a dummy hash when the email is unknown, so both failure paths take similar time and return the same message.

**Sessions**

- Opaque server-side sessions. The client receives 256 random bits (`crypto.randomBytes`) in a cookie; the database stores only their SHA-256. A database leak therefore does not reveal usable tokens.
- Sessions expire after `SESSION_TTL_HOURS` (default 12) and are deleted on logout and on account deletion.

**Cookie**

- `HttpOnly`, `SameSite=Strict`, `Path=/`.
- A relative `Max-Age` (the session TTL), never an absolute `Expires` computed from server time. An absolute expiry made cookies arrive already expired whenever server and client clocks disagreed; this was caught in CI, when a test with an injected clock started failing once real time passed its expiry. The database `expires_at` remains the authoritative limit.
- `Secure` with the `__Host-` name prefix whenever `COOKIE_SECURE=true`, which is mandatory in production and refused at startup otherwise.

**CSRF**

- The primary control is `SameSite=Strict`.
- As defence in depth, a global guard rejects state-changing requests that carry `Sec-Fetch-Site: cross-site` or an `Origin` outside `ALLOWED_ORIGINS`.

**Authorisation**

- A global guard requires a session on every route unless it is marked `@Public()`.
- Every query is scoped by `userId`. Another user's resource returns the same 404 as a missing one.

**Rate limiting**

- `@nestjs/throttler`, keyed by client IP.
- A general limit applies to every route, and a stricter named limit applies to register, login and account deletion.

**Account deletion**

- Requires the password. Cascades to all owned data, including completed audits; see ADR 0010 for how the immutability trigger allows this.

## Consequences

**Rejected alternatives**

- JWT access tokens: these cannot be revoked server-side without a denylist, which recreates sessions anyway.
- A third-party identity provider: adds an external dependency and a cost that an informational demo doesn't need.

**Known limitations**

- Registration returns `409 EMAIL_TAKEN` for an existing address, which lets someone check whether an email is registered. This is mitigated by the auth rate limit; email-verification flows are out of scope.
- Throttler state is in process memory, which is correct for a single instance only.

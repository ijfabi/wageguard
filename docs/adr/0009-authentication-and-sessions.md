# ADR 0009: Server-side sessions with argon2id, and no home-made cryptography

- Status: Accepted
- Date: 2026-10-22

## Context

The API holds personal pay data. Authentication had to use maintained libraries, HTTP-only cookies, protection against cross-site requests and rate limiting, with no cryptography written from scratch.

## Decision

Passwords are hashed with argon2id through the maintained `argon2` package, using OWASP's minimum settings (19 MiB of memory, 2 passes, 1 lane). When someone signs in with an email that doesn't exist, the password is still checked against a dummy hash. That way both kinds of failure take about the same time and return the same message.

Sessions live on the server. The browser gets 256 random bits in a cookie, and the database only stores a SHA-256 hash of them, so a leaked database doesn't contain usable tokens. Sessions expire after `SESSION_TTL_HOURS` (12 by default) and are deleted when the person signs out or deletes their account.

The cookie is `HttpOnly`, `SameSite=Strict` and `Path=/`. Its lifetime is a relative `Max-Age`, never an absolute `Expires` worked out from the server's clock. An absolute expiry arrived already expired whenever the server's and browser's clocks disagreed. That was caught in CI, when a test that used a fixed clock started failing once real time passed its expiry. The `expires_at` column in the database is the limit that actually counts. When `COOKIE_SECURE=true`, which production requires (the API refuses to start otherwise), the cookie is also `Secure` and uses the `__Host-` prefix.

`SameSite=Strict` is the main defence against cross-site requests. As a second layer, a guard rejects any state-changing request that arrives with `Sec-Fetch-Site: cross-site` or an `Origin` not in `ALLOWED_ORIGINS`.

Every route needs a session unless it's marked `@Public()`. Every query is scoped to the signed-in user, and another user's record gives the same 404 as one that doesn't exist.

Rate limiting uses `@nestjs/throttler`, keyed by client IP. A general limit covers every route, and a stricter one covers registration, sign-in and account deletion.

Deleting an account requires the password and removes everything the person owns, completed audits included. [ADR 0010](0010-audits-idempotency-and-immutability.md) explains how that gets past the trigger that otherwise protects audits.

## Consequences

JSON Web Tokens were considered and rejected. They can't be revoked on the server without a denylist, and a denylist rebuilds sessions anyway. A third-party identity provider would add an outside dependency and a cost that an informational demo doesn't need.

Two weaknesses remain. Registration returns `409 EMAIL_TAKEN` for an address that's already registered, so anyone can check whether an email has an account. The rate limit slows that down, and email verification is out of scope for now. The rate-limit counters also live in process memory, so they're only correct with a single API instance.

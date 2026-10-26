# ADR 0017: Email verification, password reset and two-step sign-in

- Status: Accepted
- Date: 2026-10-25

## Context

[ADR 0009](0009-authentication-and-sessions.md) left three gaps: registration told anyone whether an address had an account, there was no way to recover a forgotten password, and a password was the only thing standing between an attacker and someone's pay records.

## Decision

**Sign-up confirms the address.** `POST /auth/register` always returns `202` with the same body. A new address gets a confirmation link. An existing one gets an email saying someone tried to sign up, with a sign-in link and a password reset link, so its owner isn't left wondering. Opening the confirmation link signs the user in. Signing in to an unconfirmed account (with the right password) sends a fresh link.

**Email links are single-use tokens.** Each carries 256 random bits in the URL fragment (`#token=`), which browsers never send to a server, never include in a Referer header and never write to server logs. The page reads it, removes it from the address bar, and posts it to the API. Only the SHA-256 is stored. Only the newest link of each kind works, each works once, confirmation links last 24 hours and reset links 30 minutes, and one email of each kind goes out per address per minute.

**Email is a port.** Production sends through any SMTP relay named by `SMTP_URL`. Outside production, an outbox writes each message to a git-ignored JSON file, which is what the end-to-end tests read. Docker Compose runs Mailpit so the local stack behaves like production without sending anything. Emails are sent after the reply, so the response doesn't wait on them, and send failures are logged by subject and error code only.

**Two-step sign-in is optional and uses TOTP** (RFC 6238: HMAC-SHA1, 6 digits, 30-second steps, one step of drift either way), implemented with `node:crypto` and tested against the RFC's own vectors. The secret is encrypted with AES-256-GCM under `TOTP_ENCRYPTION_KEY`, and the 10 recovery codes are stored as HMACs under the same key, so a copy of the database alone yields neither. The last accepted step is recorded, so a code can't be replayed. After the right password, the user gets a pending session that lasts 10 minutes, allows 5 wrong codes, and can reach nothing but the code entry. A correct code replaces it with a new full session.

**Sessions can be managed.** Settings lists signed-in devices by browser and platform only. Changing a password or turning on two-step sign-in signs out every other session, a password reset signs out all of them, and the owner is emailed about each change.

## Alternatives considered

Passkeys (WebAuthn) would be stronger than TOTP and phishing-resistant, but need more ceremony, browser support checks and a library. TOTP works with every authenticator app and fits in about a hundred lines with no new dependency. An external identity provider was rejected again for the reasons in ADR 0009.

Putting the token in a query string would have been simpler to read, but query strings end up in logs, proxies and Referer headers.

## Consequences

Sign-up is one step longer, and the end-to-end tests read the outbox to finish it.

Production needs an SMTP provider and a domain it has verified. The Terraform for both clouds creates the secrets, but the SMTP credentials are set outside Terraform so they never enter its state.

`TOTP_ENCRYPTION_KEY` must never change once anyone has enrolled. There's no re-encryption tool yet, so rotating it would mean everyone enrolling again.

New and existing addresses still take slightly different database paths on sign-up, so the replies are identical but their timing isn't exactly the same.

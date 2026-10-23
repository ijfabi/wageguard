# ADR 0012: Web frontend architecture

- Status: Accepted
- Date: 2026-10-23

## Context

The web app must be secure with cookie sessions, accessible, and honest about unverified results. It must not duplicate API types or contain business logic.

## Decision

**Same-origin API**

- Next.js rewrites `/api/v1/*` to the API, so the browser only ever talks to the web origin.
- The session cookie stays first-party, `SameSite=Strict` works without CORS, and the API's CSRF origin guard sees the web origin.
- The rewrite target is fixed at build time (`API_ORIGIN`).

**Rendering**

- The landing and sign-in pages render on the server.
- The authenticated area is client-rendered with TanStack Query: data is per-user and always fresh, and the API is the authority.
- `proxy.ts` (Next 16's replacement for middleware) only redirects visitors without a session cookie. The app layout verifies the session with `GET /auth/me`.

**No duplicated contracts**

- Request and response types, and the auth and payslip form schemas, come from `@wageguard/api-contracts`.
- Forms use React Hook Form with `zodResolver` on those schemas.

**No business logic in components**

- These live in `src/lib` and, since Phase 4, in `@wageguard/presentation` (shared with the PDF report), as pure functions with unit tests:
  - money arithmetic in BigInt cents, never floats;
  - wall-clock date formatting that never goes through the viewer's time zone;
  - cross-midnight shift mapping;
  - status presentation;
  - open-redirect validation.
- Components compose them.

**Honest presentation**

- No green "success" tone exists. `MATCHED` is shown in blue as "Matches calculated minimum".
- Partial calculations label their difference "Difference vs checked shifts".
- The verification notice appears wherever results do.
- A test asserts that no tone uses green.

**Accessibility**

- Native `<select>`s, labelled fields with `aria-describedby` errors, a skip link, visible focus and table captions.
- The chart has a table view and honours `prefers-reduced-motion`.
- Playwright plus axe fails CI on any serious or critical WCAG 2.1 AA violation across 13 page states.

**Components**

- shadcn/ui, with its components committed in `src/components/ui`.
- The CLI's new `cn` package (pre-1.0, published within the previous week) was replaced with the local `clsx` and `tailwind-merge` helper, per the "avoid unstable libraries" rule.

## Consequences

- **CSP (updated in Phase 4).** `proxy.ts` now sets a per-request nonce policy and the root layout renders every page per request, so `script-src` has no `'unsafe-inline'`. Zod's JIT probe would have been reported as a blocked eval, so Zod runs in `jitless` mode in the browser (`instrumentation-client.ts`). Styles still allow `'unsafe-inline'`.
- **A loading flash.** Client-rendered authenticated pages show a loading state before data arrives. This was accepted for simplicity and correctness.

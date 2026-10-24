# ADR 0012: How the web app is built

- Status: Accepted
- Date: 2026-10-23

## Context

The web app has to keep cookie sessions secure and be accessible. It also has to be careful not to make unverified results look verified. It shouldn't redefine the API's types or contain business logic of its own.

## Decision

### Same-origin API

Next.js forwards `/api/v1/*` to the API, so the browser only ever talks to the web app's own address. The session cookie stays first-party, `SameSite=Strict` works without any CORS setup, and the API's origin check sees the web app's address. Where requests are forwarded is fixed when the image is built (`API_ORIGIN`).

### Rendering

The landing and sign-in pages render on the server. The signed-in pages fetch their data in the browser with TanStack Query, because the data is personal, should always be fresh, and the API is the authority on it. `proxy.ts` (Next 16's replacement for middleware) only redirects visitors who have no session cookie at all. The app layout then confirms the session properly with `GET /auth/me`.

### Shared contracts

Request and response types, and the schemas behind the sign-in and payslip forms, come from `@wageguard/api-contracts`. Forms use React Hook Form with `zodResolver` on those same schemas.

### Logic outside the components

Money arithmetic (in whole cents with `BigInt`, never floating point), dates formatted exactly as entered and never shifted into the viewer's time zone, shifts that cross midnight, status wording and redirect validation are all small pure functions with unit tests. They started in `src/lib`. Since Phase 4, the parts the PDF report also needs live in `@wageguard/presentation`. Components only put those pieces together.

### Not overstating results

There's no green "success" colour anywhere, and a test checks that none of the status styles use one. A match is shown in blue as "Matches calculated minimum". When only some shifts could be priced, the difference is labelled "Difference vs checked shifts". The note that the rules haven't been professionally reviewed appears wherever results do.

### Accessibility

Fields have labels, and their error messages are linked with `aria-describedby`. Selects are native elements. There's a skip link, focus is always visible, and tables have captions. The chart has a table view and respects `prefers-reduced-motion`. Playwright runs axe across 13 page states, and CI fails on any serious or critical WCAG 2.1 AA problem.

### Components

The UI uses shadcn/ui, with its components copied into `src/components/ui`. The shadcn CLI's new `cn` package was less than a week old and not yet at 1.0, so it was replaced with the usual local helper built on `clsx` and `tailwind-merge`.

## Consequences

The content security policy was tightened in Phase 4. `proxy.ts` now sets a policy with a fresh nonce on every request, and the root layout renders every page per request, so scripts no longer need `'unsafe-inline'`. Zod normally tests whether it may compile code at runtime, and the browser reported that test as a blocked `eval`, so Zod runs in `jitless` mode in the browser (set up in `instrumentation-client.ts`). Styles still allow `'unsafe-inline'`.

Signed-in pages show a brief loading state before their data arrives. That was accepted to keep the rendering model simple and the data always correct.

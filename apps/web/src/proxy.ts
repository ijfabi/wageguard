import { NextResponse, type NextRequest } from "next/server";

import { buildCsp, createNonce } from "@/lib/csp";

/** Either cookie name the API may issue (the `__Host-` form is used whenever cookies are Secure). */
const SESSION_COOKIES = ["__Host-wg_session", "wg_session"] as const;

const SIGNED_IN_AREAS = ["/dashboard", "/employments", "/shifts", "/payslips", "/audits", "/settings"];

/**
 * Runs before every page render:
 * 1. Sets a per-request nonce Content Security Policy (see lib/csp.ts). Next.js reads the policy
 *    from the request headers and applies the nonce to its scripts during rendering.
 * 2. Redirects signed-out visitors away from the signed-in area. This only checks that a session
 *    cookie is present; the API remains the authority and rejects invalid or expired sessions,
 *    which the app layout handles.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const protectedPath = SIGNED_IN_AREAS.some((area) => pathname === area || pathname.startsWith(`${area}/`));
  if (protectedPath && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  const csp = buildCsp(createNonce(), process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API rewrite (the API sends its own strict CSP) or static assets.
      source: "/((?!api/|_next/static|_next/image|favicon.ico).*)",
      // Router prefetches carry no executable HTML.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

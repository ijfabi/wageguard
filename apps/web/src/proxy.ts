import { NextResponse, type NextRequest } from "next/server";

/** Either cookie name the API may issue (the `__Host-` form is used whenever cookies are Secure). */
const SESSION_COOKIES = ["__Host-wg_session", "wg_session"] as const;

/**
 * Fast redirect for signed-out visitors. This only checks that a session cookie is present; the
 * API remains the authority and rejects invalid or expired sessions, which the app layout handles.
 */
export function proxy(request: NextRequest): NextResponse {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) {
    return NextResponse.next();
  }
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/employments/:path*",
    "/shifts/:path*",
    "/payslips/:path*",
    "/audits/:path*",
    "/settings/:path*",
  ],
};

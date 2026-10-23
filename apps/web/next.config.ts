import path from "node:path";

import type { NextConfig } from "next";

/** Where the API listens. Requests to /api/v1/* are rewritten there, so the browser only ever talks to this origin. */
const API_ORIGIN = process.env["API_ORIGIN"] ?? "http://127.0.0.1:3001";
const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy. Next.js injects inline bootstrap scripts, so `script-src` needs
 * 'unsafe-inline' without a nonce-based setup (a documented hardening follow-up). Development also
 * needs 'unsafe-eval' for hot reloading. Everything else is restricted to this origin.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image; tracing starts at the monorepo root so
  // workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "..", ".."),
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  rewrites() {
    return Promise.resolve([{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }]);
  },
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]);
  },
};

export default nextConfig;

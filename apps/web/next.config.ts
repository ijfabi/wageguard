import path from "node:path";

import type { NextConfig } from "next";

/** Where the API listens. Requests to /api/v1/* are rewritten there, so the browser only ever talks to this origin. */
const API_ORIGIN = process.env["API_ORIGIN"] ?? "http://127.0.0.1:3001";

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
  // The Content-Security-Policy is per request (it carries a nonce), so src/proxy.ts sets it.
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
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

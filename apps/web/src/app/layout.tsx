import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";
import { DISPLAY_BOOTSTRAP_SCRIPT } from "@/lib/display-preferences";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "WageGuard", template: "%s · WageGuard" },
  description:
    "Understand your pay. Verify every dollar. Independent payroll checks for Australian retail employees.",
};

/**
 * Every page renders per request: the CSP nonce set by proxy.ts can only be applied to scripts at
 * render time, and prerendered HTML would carry no nonce and be blocked.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // The display script sets classes and data attributes on <html> before hydration.
    <html lang="en-AU" suppressHydrationWarning>
      <head>
        {/* A constant string from our own code, allowed by the per-request CSP nonce. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: DISPLAY_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

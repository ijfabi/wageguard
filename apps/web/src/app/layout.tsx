import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";

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
  return (
    <html lang="en-AU">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

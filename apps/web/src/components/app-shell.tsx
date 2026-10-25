"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldCheck } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { AccessibilityMenu } from "@/components/accessibility-menu";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

const NAV: readonly { href: Route; label: string }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/employments", label: "Employment" },
  { href: "/shifts", label: "Shifts" },
  { href: "/payslips", label: "Payslips" },
  { href: "/audits", label: "Audits" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function signOut() {
    await api.logout().catch(() => undefined);
    queryClient.clear();
    router.replace("/sign-in");
  }

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="focus:bg-background sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to main content
      </a>
      <header className="bg-background/95 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="text-primary size-5" aria-hidden />
            WageGuard
          </Link>
          <nav aria-label="Main" className="order-3 w-full sm:order-none sm:w-auto">
            <ul className="flex flex-wrap gap-1">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-secondary text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-muted-foreground hidden text-sm lg:inline">{email}</span>
            <AccessibilityMenu />
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}

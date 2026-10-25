"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CalendarClock,
  ChevronsUpDown,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ReceiptText,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState, type ReactNode } from "react";

import { AccessibilityMenu } from "@/components/accessibility-menu";
import { BrandName } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

interface NavItem {
  readonly href: Route;
  readonly label: string;
  readonly icon: LucideIcon;
}

const NAV: readonly { readonly heading: string; readonly items: readonly NavItem[] }[] = [
  { heading: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    heading: "Your records",
    items: [
      { href: "/employments", label: "Employment", icon: BriefcaseBusiness },
      { href: "/shifts", label: "Shifts", icon: CalendarClock },
      { href: "/payslips", label: "Payslips", icon: ReceiptText },
    ],
  },
  { heading: "Results", items: [{ href: "/audits", label: "Audits", icon: FileSearch }] },
  { heading: "Account", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
];

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {NAV.map((group) => (
        <div key={group.heading}>
          <p className="text-sidebar-muted/80 mb-1.5 px-3 text-[0.6875rem] font-semibold tracking-wider uppercase">
            {group.heading}
          </p>
          <ul className="grid gap-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => onNavigate?.()}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      "focus-visible:outline-brand",
                      active
                        ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                        : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    {active ? (
                      <span
                        className="bg-brand absolute top-2 bottom-2 left-0 w-0.5 rounded-full"
                        aria-hidden
                      />
                    ) : null}
                    <item.icon
                      className={cn("size-4 shrink-0", active ? "text-brand" : "opacity-80")}
                      aria-hidden
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function AccountMenu({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const initial = email.charAt(0).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-sidebar-accent/70 focus-visible:outline-brand flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors"
        >
          <span className="bg-sidebar-accent text-sidebar-foreground grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-sidebar-muted block text-[0.6875rem]">Signed in as</span>
            <span className="text-sidebar-foreground block truncate text-sm">{email}</span>
          </span>
          <ChevronsUpDown className="text-sidebar-muted size-4 shrink-0" aria-hidden />
          <span className="sr-only">Account menu</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="text-muted-foreground truncate text-xs font-normal">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden />
            Account and security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({
  email,
  pathname,
  onNavigate,
  onSignOut,
}: {
  email: string;
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-6 px-3 py-5">
      <Link href="/dashboard" className="text-sidebar-foreground px-2" onClick={() => onNavigate?.()}>
        <BrandName />
      </Link>
      <Button
        asChild
        className="bg-brand text-sidebar hover:bg-brand/90 mx-1 justify-start font-semibold shadow-none"
      >
        <Link href="/audits/new" onClick={() => onNavigate?.()}>
          <Plus aria-hidden />
          Run an audit
        </Link>
      </Button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Navigation pathname={pathname} onNavigate={() => onNavigate?.()} />
      </div>
      <div className="border-sidebar-border grid grid-cols-[minmax(0,1fr)] gap-1 border-t pt-4">
        <AccessibilityMenu className="text-sidebar-muted hover:bg-sidebar-accent/70 hover:text-sidebar-foreground justify-start" />
        <AccountMenu email={email} onSignOut={onSignOut} />
      </div>
    </div>
  );
}

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    await api.logout().catch(() => undefined);
    queryClient.clear();
    router.replace("/sign-in");
  }

  return (
    <div className="min-h-screen lg:pl-64">
      <a
        href="#main"
        className="focus:bg-background sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to main content
      </a>

      <aside
        aria-label="Sidebar"
        className="bg-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-transparent lg:block"
      >
        <SidebarBody email={email} pathname={pathname} onSignOut={() => void signOut()} />
      </aside>

      <header className="bg-sidebar text-sidebar-foreground sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden">
        <Link href="/dashboard">
          <BrandName />
        </Link>
        <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogPrimitive.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <Menu aria-hidden />
              <span className="sr-only">Open menu</span>
            </Button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/50" />
            <DialogPrimitive.Content className="bg-sidebar data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-xl outline-none">
              <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">Pages and account</DialogPrimitive.Description>
              <SidebarBody
                email={email}
                pathname={pathname}
                onNavigate={() => {
                  setMenuOpen(false);
                }}
                onSignOut={() => void signOut()}
              />
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground absolute top-5 right-3"
                >
                  <X aria-hidden />
                  <span className="sr-only">Close menu</span>
                </Button>
              </DialogPrimitive.Close>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
}

import { BadgeCheck, FileText, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AccessibilityMenu } from "@/components/accessibility-menu";
import { BrandName } from "@/components/brand";

const POINTS = [
  {
    icon: BadgeCheck,
    title: "Rates from the award itself",
    text: "Every rate is copied from the General Retail Industry Award and tested against its published tables.",
  },
  {
    icon: FileText,
    title: "Every dollar explained",
    text: "Each result shows the clause, the hours and the rate behind it, and exports as a PDF report.",
  },
  {
    icon: Lock,
    title: "Your data stays yours",
    text: "Two-factor sign-in is available, and you can delete your account and everything in it at any time.",
  },
] as const;

/** Sign-in, sign-up and account recovery: the form on the right, what WageGuard is on the left. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-[#070b1f] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute -top-40 -left-40 size-[36rem] rounded-full bg-indigo-600/30 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -right-32 -bottom-48 size-[32rem] rounded-full bg-cyan-500/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute inset-0 [background-image:linear-gradient(oklch(1_0_0/0.04)_1px,transparent_1px),linear-gradient(90deg,oklch(1_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px]"
        />
        <Link href="/" className="relative">
          <BrandName className="text-lg" />
        </Link>
        <div className="relative max-w-md">
          <p className="text-3xl leading-tight font-semibold tracking-tight">
            Every hour has a price.{" "}
            <span className="bg-gradient-to-r from-indigo-200 to-cyan-300 bg-clip-text text-transparent">
              Make sure you were paid it.
            </span>
          </p>
          <ul className="mt-10 grid gap-6">
            {POINTS.map((point) => (
              <li key={point.title} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <point.icon className="size-4 text-cyan-300" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{point.title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-slate-300">{point.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">
          An information tool for Australian retail employees. Not legal advice.
        </p>
      </aside>

      <div className="bg-card flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-5 sm:px-10">
          <Link href="/" className="lg:invisible">
            <BrandName />
          </Link>
          <AccessibilityMenu />
        </div>
        <main id="main" className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}

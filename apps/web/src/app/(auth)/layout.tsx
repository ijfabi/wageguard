import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-secondary/40 flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="text-primary size-6" aria-hidden />
        WageGuard
      </Link>
      <main className="w-full max-w-sm">{children}</main>
    </div>
  );
}

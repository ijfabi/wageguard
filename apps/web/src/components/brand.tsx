import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/** The WageGuard mark: a shield on the homepage's indigo-to-cyan tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-[0_0_0_1px_oklch(1_0_0/0.15)_inset]",
        className,
      )}
      aria-hidden
    >
      <ShieldCheck className="size-[1.1rem]" />
    </span>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <BrandMark />
      WageGuard
    </span>
  );
}

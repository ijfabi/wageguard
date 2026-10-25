import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

const ICON_TONE: Readonly<Record<Tone | "brand", string>> = {
  brand: "bg-accent text-primary",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-neutral-soft text-neutral",
};

/** A headline figure with its label, an icon and one line of context. */
export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: LucideIcon;
  tone?: Tone | "brand";
}) {
  return (
    <div className="bg-card shadow-panel flex min-w-0 flex-col gap-3 rounded-xl border p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", ICON_TONE[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums">{value}</p>
      {detail === undefined ? null : (
        <p className="text-muted-foreground text-xs leading-relaxed">{detail}</p>
      )}
    </div>
  );
}

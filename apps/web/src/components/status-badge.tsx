import type { AuditDetail } from "@wageguard/api-contracts";

import {
  FINDING_STATUS,
  TONE_CLASSES,
  calculationStatusPresentation,
  type FindingStatus,
  type Tone,
} from "@/lib/status";
import { cn } from "@/lib/utils";

const DOT: Readonly<Record<Tone, string>> = {
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-neutral",
};

function Pill({
  tone,
  label,
  title,
  className,
}: {
  tone: Tone;
  label: string;
  title?: string;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
      title={title}
    >
      <span className={cn("size-1.5 rounded-full", DOT[tone])} aria-hidden />
      {label}
    </span>
  );
}

export function FindingStatusBadge({ status, className }: { status: FindingStatus; className?: string }) {
  const presentation = FINDING_STATUS[status];
  return <Pill tone={presentation.tone} label={presentation.label} className={className} />;
}

export function CalculationStatusBadge({
  audit,
}: {
  audit: Pick<AuditDetail, "calculationStatus" | "expectedAmount">;
}) {
  const presentation = calculationStatusPresentation(audit);
  return <Pill tone={presentation.tone} label={presentation.label} title={presentation.description} />;
}

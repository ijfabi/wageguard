import {
  CALCULATION_STATUS,
  FINDING_STATUS,
  TONE_CLASSES,
  type CalculationStatus,
  type FindingStatus,
} from "@/lib/status";
import { cn } from "@/lib/utils";

export function FindingStatusBadge({ status, className }: { status: FindingStatus; className?: string }) {
  const presentation = FINDING_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[presentation.tone],
        className,
      )}
    >
      {presentation.label}
    </span>
  );
}

export function CalculationStatusBadge({ status }: { status: CalculationStatus }) {
  const presentation = CALCULATION_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[presentation.tone],
      )}
      title={presentation.description}
    >
      {presentation.label}
    </span>
  );
}

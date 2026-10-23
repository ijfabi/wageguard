import { useId, type ReactElement, type ReactNode } from "react";
import { cloneElement } from "react";

import { Label } from "@/components/ui/label";

interface FieldProps {
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: ReactNode;
  /** A single input-like element; it receives id, aria-invalid and aria-describedby. */
  readonly children: ReactElement<Record<string, unknown>>;
}

/** Label + control + hint + error, wired together for screen readers. */
export function FormField({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        "aria-invalid": error === undefined ? undefined : true,
        "aria-describedby": describedBy === "" ? undefined : describedBy,
      })}
      {hint === undefined ? null : (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

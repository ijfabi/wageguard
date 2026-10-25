import { useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A native checkbox with its label and an optional explanation. Native inputs work with
 * react-hook-form's register() and with every assistive technology.
 */
export function CheckboxField({
  label,
  hint,
  error,
  className,
  ...input
}: Omit<ComponentProps<"input">, "type"> & { label: string; hint?: ReactNode; error?: string | undefined }) {
  const id = useId();
  return (
    <div className={cn("grid gap-1", className)}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className="border-input accent-primary mt-0.5 size-4 shrink-0 rounded"
          aria-describedby={hint === undefined ? undefined : `${id}-hint`}
          aria-invalid={error === undefined ? undefined : true}
          {...input}
        />
        <label htmlFor={id} className="text-sm leading-snug font-medium">
          {label}
          {hint === undefined ? null : (
            <span id={`${id}-hint`} className="text-muted-foreground mt-0.5 block text-xs font-normal">
              {hint}
            </span>
          )}
        </label>
      </div>
      {error === undefined ? null : (
        <p className="text-danger ml-7 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

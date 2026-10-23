import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A styled native <select>. Native selects are fully keyboard and screen-reader accessible and work
 * directly with react-hook-form's register(), so they are used for all form choices.
 */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs",
        "focus-visible:ring-ring/50 focus-visible:border-ring outline-none focus-visible:ring-[3px]",
        "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

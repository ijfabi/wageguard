import type { ReactNode } from "react";

/**
 * A titled group of form fields: what the section is for on the left, the fields on the right.
 * Uses a fieldset so the title is announced with every control inside it.
 */
export function FormSection({
  title,
  description,
  children,
  columns = 2,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <fieldset className="grid gap-x-10 gap-y-4 border-t py-7 first:border-t-0 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div>
        <legend className="float-left text-sm font-semibold tracking-tight">{title}</legend>
        {description === undefined ? null : (
          <p className="text-muted-foreground clear-left pt-1 text-sm leading-relaxed">{description}</p>
        )}
      </div>
      <div
        className={
          columns === 2
            ? "grid min-w-0 content-start gap-4 sm:grid-cols-2"
            : "grid min-w-0 content-start gap-4"
        }
      >
        {children}
      </div>
    </fieldset>
  );
}

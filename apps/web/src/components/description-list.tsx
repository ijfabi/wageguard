import type { ReactNode } from "react";

/** Label and value pairs, one per row, for read-only details. */
export function DescriptionList({ items }: { items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="divide-border/70 divide-y text-sm">
      {items.map(([term, value]) => (
        <div
          key={term}
          className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6"
        >
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="font-medium sm:text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

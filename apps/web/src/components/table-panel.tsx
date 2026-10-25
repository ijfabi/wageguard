import type { ReactNode } from "react";

/** A white panel around a table, with an optional toolbar above it (filters, counts). */
export function TablePanel({ toolbar, children }: { toolbar?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-card shadow-panel overflow-hidden rounded-xl border">
      {toolbar === undefined ? null : (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3">{toolbar}</div>
      )}
      {children}
    </div>
  );
}

"use client";

import { AlertCircle, Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiRequestError, errorMessage } from "@/lib/api/client";

/** Placeholder rows while data loads; announced to assistive technology. */
export function LoadingState({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <span className="bg-accent text-primary ring-primary/10 grid size-11 place-items-center rounded-full ring-8">
        <Icon className="size-5" aria-hidden />
      </span>
      <h2 className="mt-2 text-base font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed">{description}</p>
      {action === undefined ? null : <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Error with a retry action and the correlation id, so a user can quote it when reporting a problem. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const correlationId = error instanceof ApiRequestError ? error.correlationId : null;
  return (
    <div role="alert" className="border-danger/30 bg-danger-soft flex flex-col gap-3 rounded-xl border p-5">
      <div className="text-danger flex items-center gap-2 font-medium">
        <AlertCircle className="size-5" aria-hidden />
        Could not load this information
      </div>
      <p className="text-sm">{errorMessage(error)}</p>
      {correlationId === null ? null : (
        <p className="text-muted-foreground font-mono text-xs">Reference: {correlationId}</p>
      )}
      {onRetry === undefined ? null : (
        <div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

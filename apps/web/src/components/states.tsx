"use client";

import { AlertCircle, Inbox } from "lucide-react";
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
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <Inbox className="text-muted-foreground size-8" aria-hidden />
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-muted-foreground max-w-md text-sm">{description}</p>
      {action}
    </div>
  );
}

/** Error with a retry action and the correlation id, so a user can quote it when reporting a problem. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const correlationId = error instanceof ApiRequestError ? error.correlationId : null;
  return (
    <div role="alert" className="border-danger/30 bg-danger-soft flex flex-col gap-3 rounded-lg border p-5">
      <div className="text-danger flex items-center gap-2 font-medium">
        <AlertCircle className="size-5" aria-hidden />
        Could not load this information
      </div>
      <p className="text-sm">{errorMessage(error)}</p>
      {correlationId === null ? null : (
        <p className="text-muted-foreground text-xs">Reference: {correlationId}</p>
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

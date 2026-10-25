"use client";

import { ArrowUpRight, BriefcaseBusiness, MapPin, Plus } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { useEmployments } from "@/lib/api/hooks";
import { EMPLOYMENT_TYPE_LABELS, classificationLabel, stateLabel } from "@/lib/employment-form";

export default function EmploymentsPage() {
  const employments = useEmployments();
  const add = (
    <Button asChild>
      <Link href="/employments/new">
        <Plus aria-hidden />
        Add employment
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Employment"
        description="Describe each job you want to check. WageGuard never assumes award coverage from a job title."
        actions={add}
      />
      <section aria-label="Your employments">
        {employments.isPending ? (
          <LoadingState label="Loading employments" />
        ) : employments.isError ? (
          <ErrorState error={employments.error} onRetry={() => void employments.refetch()} />
        ) : employments.data.items.length === 0 ? (
          <EmptyState
            icon={BriefcaseBusiness}
            title="No employment yet"
            description="Add the job you want to check. You can add more than one."
            action={add}
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {employments.data.items.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/employments/${e.id}`}
                  className="group bg-card shadow-panel hover:border-primary/40 hover:shadow-raised flex h-full flex-col gap-4 rounded-xl border p-5 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="bg-accent text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                      <BriefcaseBusiness className="size-5" aria-hidden />
                    </span>
                    <ArrowUpRight
                      className="text-muted-foreground group-hover:text-primary size-4 transition-colors"
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold tracking-tight">{e.label}</h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {classificationLabel(e.classificationCode)}
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
                    <span className="bg-secondary rounded-full px-2 py-0.5 font-medium">
                      {EMPLOYMENT_TYPE_LABELS[e.employmentType]}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden />
                      {stateLabel(e.state)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

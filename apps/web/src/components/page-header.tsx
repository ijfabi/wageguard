import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export interface Crumb {
  readonly label: string;
  readonly href?: Route;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Parent pages, shown above the title. The current page is the title itself. */
  breadcrumbs?: readonly Crumb[];
  /** Small facts under the description (badges, counts, dates). */
  meta?: ReactNode;
}) {
  return (
    // The title keeps at least 32rem; the actions drop below it only when they would squeeze it.
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 flex-[1_1_32rem]">
        {breadcrumbs === undefined || breadcrumbs.length === 0 ? null : (
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs font-medium">
              {breadcrumbs.map((crumb) => (
                <li key={crumb.label} className="flex items-center gap-1">
                  {crumb.href === undefined ? (
                    <span>{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="hover:text-foreground transition-colors">
                      {crumb.label}
                    </Link>
                  )}
                  <ChevronRight className="size-3 opacity-60" aria-hidden />
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {description === undefined ? null : (
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">{description}</p>
        )}
        {meta === undefined ? null : (
          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-xs">{meta}</div>
        )}
      </div>
      {actions === undefined ? null : <div className="flex min-w-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

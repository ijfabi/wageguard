import { Info } from "lucide-react";

/** The standing disclaimer shown wherever results are presented. */
export function VerificationNotice() {
  return (
    <aside
      className="border-info/30 bg-info-soft flex gap-3 rounded-lg border p-4 text-sm"
      aria-label="About these results"
    >
      <Info className="text-info mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        WageGuard is an informational tool, not legal advice. Award rates were transcribed from the official
        General Retail Industry Award and checked by automated tests, but have not been reviewed by a payroll
        or legal professional. Results marked &ldquo;Needs review&rdquo; or &ldquo;Not supported&rdquo; are
        not verified discrepancies.
      </p>
    </aside>
  );
}

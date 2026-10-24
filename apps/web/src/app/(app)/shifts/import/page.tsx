"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type SyntheticEvent } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError, errorMessage } from "@/lib/api/client";
import { useEmployments, useImportShifts } from "@/lib/api/hooks";

/** Mirrors the API limit (LIMITS.maxCsvBytes) so users get feedback before uploading. */
const MAX_CSV_BYTES = 256 * 1024;
const EXAMPLE =
  "start,end,meal_start,meal_end\n2026-07-06T09:00,2026-07-06T17:00,2026-07-06T12:00,2026-07-06T12:30\n2026-07-07T18:00,2026-07-07T21:00,,";

export default function ImportShiftsPage() {
  const employments = useEmployments();
  const importShifts = useImportShifts();
  const router = useRouter();
  const [employmentId, setEmploymentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [problems, setProblems] = useState<readonly { line: string; message: string }[]>([]);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setProblems([]);
    setFile(event.target.files?.[0] ?? null);
  }

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = employmentId === "" ? employments.data?.items[0]?.id : employmentId;
    if (file === null || target === undefined) {
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setProblems([
        { line: "File", message: "The file is larger than 256 KB. Split it into smaller files." },
      ]);
      return;
    }
    try {
      const result = await importShifts.mutateAsync({ employmentId: target, csv: await file.text() });
      toast.success(`Imported ${result.imported} ${result.imported === 1 ? "shift" : "shifts"}`);
      router.push(`/shifts?employmentId=${target}`);
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.issues.length > 0) {
        setProblems(error.issues.map((i) => ({ line: i.path ?? "File", message: i.message })));
      } else {
        setProblems([{ line: "File", message: errorMessage(error) }]);
      }
    }
  }

  if (employments.isPending) {
    return <LoadingState />;
  }
  if (employments.isError) {
    return <ErrorState error={employments.error} onRetry={() => void employments.refetch()} />;
  }
  if (employments.data.items.length === 0) {
    return (
      <>
        <PageHeader title="Import shifts from CSV" />
        <EmptyState
          title="Add an employment first"
          description="Imported shifts are added to an employment."
          action={
            <Button asChild>
              <Link href="/employments">Add employment</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Import shifts from CSV"
        description="All rows are checked first. If any row has a problem, nothing is imported."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardContent>
            <form className="grid gap-4" onSubmit={(e) => void onSubmit(e)}>
              <div className="grid gap-1.5">
                <Label htmlFor="import-employment">Employment</Label>
                <NativeSelect
                  id="import-employment"
                  value={employmentId}
                  onChange={(e) => {
                    setEmploymentId(e.target.value);
                  }}
                >
                  {employments.data.items.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="csv-file">CSV file</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onFile}
                  aria-describedby="csv-hint"
                />
                <p id="csv-hint" className="text-muted-foreground text-xs">
                  Up to 500 shifts and 256 KB.
                </p>
              </div>
              {problems.length === 0 ? null : (
                <div role="alert" className="border-danger/30 bg-danger-soft rounded-lg border p-4 text-sm">
                  <p className="text-danger font-medium">
                    Nothing was imported. Fix these problems and try again:
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {problems.map((p, i) => (
                      <li key={i}>
                        <span className="font-medium">{p.line}:</span> {p.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <Button type="submit" disabled={file === null || importShifts.isPending}>
                  {importShifts.isPending ? "Importing…" : "Import shifts"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>File format</h2>
            </CardTitle>
            <CardDescription>
              First line exactly as shown. Times are local wall-clock times. Leave the meal columns empty if
              there was no meal break.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Wrapped rather than scrolled: a hidden horizontal scrollbar made the example look cut off. */}
            <pre className="bg-muted rounded-md p-3 text-xs break-all whitespace-pre-wrap">{EXAMPLE}</pre>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

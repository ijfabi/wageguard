"use client";

import { useRouter } from "next/navigation";
import { use } from "react";
import { toast } from "sonner";

import { EmploymentForm } from "@/components/employment-form";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingState } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { errorMessage } from "@/lib/api/client";
import { useEmployment, useUpdateEmployment } from "@/lib/api/hooks";
import { toCreateEmploymentRequest, toEmploymentFormValues } from "@/lib/employment-form";

export default function EditEmploymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const employment = useEmployment(id);
  const update = useUpdateEmployment(id);

  if (employment.isPending) {
    return <LoadingState label="Loading employment" />;
  }
  if (employment.isError) {
    return <ErrorState error={employment.error} onRetry={() => void employment.refetch()} />;
  }
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Employment", href: "/employments" },
          { label: employment.data.label, href: `/employments/${id}` },
        ]}
        title="Edit employment"
        description="Changes apply to audits you run from now on. Audits already run keep the details they were calculated with."
      />
      <Card>
        <CardContent>
          <EmploymentForm
            initial={toEmploymentFormValues(employment.data)}
            submitLabel="Save changes"
            onCancel={() => {
              router.push(`/employments/${id}`);
            }}
            onSubmit={async (values) => {
              try {
                await update.mutateAsync(toCreateEmploymentRequest(values));
                toast.success("Employment updated");
                router.push(`/employments/${id}`);
              } catch (error: unknown) {
                toast.error(errorMessage(error));
              }
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

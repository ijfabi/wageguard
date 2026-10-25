"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { EmploymentForm } from "@/components/employment-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { errorMessage } from "@/lib/api/client";
import { useCreateEmployment } from "@/lib/api/hooks";
import { toCreateEmploymentRequest } from "@/lib/employment-form";

export default function NewEmploymentPage() {
  const router = useRouter();
  const create = useCreateEmployment();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Employment", href: "/employments" }]}
        title="New employment"
        description="General Retail Industry Award 2020 (MA000004). These answers decide which rates apply."
      />
      <Card>
        <CardContent>
          <EmploymentForm
            submitLabel="Save employment"
            onCancel={() => {
              router.push("/employments");
            }}
            onSubmit={async (values) => {
              try {
                const created = await create.mutateAsync(toCreateEmploymentRequest(values));
                toast.success("Employment added");
                router.push(`/employments/${created.id}`);
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

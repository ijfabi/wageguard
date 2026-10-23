"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { LoginRequestSchema, RegisterRequestSchema } from "@wageguard/api-contracts";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiRequestError, errorMessage } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { keys } from "@/lib/api/hooks";
import { safeRedirect } from "@/lib/safe-redirect";

type Mode = "sign-in" | "sign-up";
type Values = z.input<typeof RegisterRequestSchema>;

/** Sign-in and sign-up share one form; validation comes from the API contract schemas. */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const schema = mode === "sign-up" ? RegisterRequestSchema : LoginRequestSchema;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      const me = mode === "sign-up" ? await api.register(values) : await api.login(values);
      queryClient.setQueryData(keys.me, me);
      router.replace(safeRedirect(params.get("next")));
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.code === "EMAIL_TAKEN") {
        form.setError("email", { message: "An account with this email already exists. Sign in instead." });
        return;
      }
      setFormError(errorMessage(error));
    }
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{mode === "sign-up" ? "Create your account" : "Sign in"}</h1>
        </CardTitle>
        <CardDescription>
          {mode === "sign-up"
            ? "Use a synthetic email address: this is a demonstration service."
            : "Welcome back. Sign in to see your audits."}
        </CardDescription>
      </CardHeader>
      {/* method="post": if submitted before JavaScript loads, credentials must not end up in the URL. */}
      <form method="post" onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} noValidate>
        <CardContent className="grid gap-4">
          {formError === null ? null : (
            <p
              role="alert"
              className="border-danger/30 bg-danger-soft text-danger rounded-md border p-3 text-sm"
            >
              {formError}
            </p>
          )}
          <FormField label="Email" error={errors.email?.message}>
            <Input type="email" autoComplete="email" {...form.register("email")} />
          </FormField>
          <FormField
            label="Password"
            error={errors.password?.message}
            hint={mode === "sign-up" ? "At least 12 characters. A passphrase works well." : undefined}
          >
            <Input
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              {...form.register("password")}
            />
          </FormField>
        </CardContent>
        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
          <p className="text-muted-foreground text-sm">
            {mode === "sign-up" ? "Already have an account? " : "New to WageGuard? "}
            <Link className="text-primary underline" href={mode === "sign-up" ? "/sign-in" : "/sign-up"}>
              {mode === "sign-up" ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

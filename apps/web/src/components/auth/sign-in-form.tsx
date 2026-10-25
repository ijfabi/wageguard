"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { LoginRequestSchema, TwoFactorLoginRequestSchema, type MeResponse } from "@wageguard/api-contracts";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { AuthHeading, CheckInbox, FormError } from "@/components/auth/auth-parts";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiRequestError, errorMessage } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { keys } from "@/lib/api/hooks";
import { safeRedirect } from "@/lib/safe-redirect";

type Step =
  { kind: "credentials"; notice?: string } | { kind: "two-factor" } | { kind: "unverified"; email: string };

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: "credentials" });

  function finish(me: MeResponse) {
    queryClient.setQueryData(keys.me, me);
    router.replace(safeRedirect(params.get("next")));
  }

  if (step.kind === "unverified") {
    return (
      <CheckInbox email={step.email} title="Confirm your email first">
        Open the link in it to finish setting up your account, then sign in.
      </CheckInbox>
    );
  }
  if (step.kind === "two-factor") {
    return (
      <TwoFactorStep
        onDone={finish}
        onRestart={(notice) => {
          setStep(notice === undefined ? { kind: "credentials" } : { kind: "credentials", notice });
        }}
      />
    );
  }
  return (
    <CredentialsStep
      notice={step.notice ?? null}
      onSignedIn={finish}
      onTwoFactor={() => {
        setStep({ kind: "two-factor" });
      }}
      onUnverified={(email) => {
        setStep({ kind: "unverified", email });
      }}
    />
  );
}

type Credentials = z.input<typeof LoginRequestSchema>;

function CredentialsStep({
  notice,
  onSignedIn,
  onTwoFactor,
  onUnverified,
}: {
  notice: string | null;
  onSignedIn: (me: MeResponse) => void;
  onTwoFactor: () => void;
  onUnverified: (email: string) => void;
}) {
  const [formError, setFormError] = useState<string | null>(notice);
  const form = useForm<Credentials>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: Credentials) {
    setFormError(null);
    try {
      const result = await api.login(values);
      if (result.status === "TWO_FACTOR_REQUIRED") {
        onTwoFactor();
      } else {
        onSignedIn(result.me);
      }
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.code === "EMAIL_NOT_VERIFIED") {
        onUnverified(values.email.trim().toLowerCase());
        return;
      }
      setFormError(errorMessage(error));
    }
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <>
      <AuthHeading title="Sign in" description="Welcome back. Sign in to see your audits." />
      {/* method="post": if submitted before JavaScript loads, credentials must not end up in the URL. */}
      <form
        method="post"
        className="grid gap-5"
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        noValidate
      >
        <FormError message={formError} />
        <FormField label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register("email")} />
        </FormField>
        <div className="grid gap-1.5">
          <FormField label="Password" error={errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...form.register("password")} />
          </FormField>
          <Link
            href="/forgot-password"
            className="text-primary justify-self-end text-xs font-medium hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="text-muted-foreground mt-8 text-center text-sm">
        New to WageGuard?{" "}
        <Link className="text-primary font-medium hover:underline" href="/sign-up">
          Create an account
        </Link>
      </p>
    </>
  );
}

type CodeValues = z.input<typeof TwoFactorLoginRequestSchema>;

function TwoFactorStep({
  onDone,
  onRestart,
}: {
  onDone: (me: MeResponse) => void;
  onRestart: (notice?: string) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const form = useForm<CodeValues>({
    resolver: zodResolver(TwoFactorLoginRequestSchema),
    defaultValues: { code: "" },
  });

  async function onSubmit(values: CodeValues) {
    setFormError(null);
    try {
      onDone(await api.loginTwoFactor(values.code));
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.code === "UNAUTHENTICATED") {
        // Too many wrong codes, or the 10 minutes ran out: the password is needed again.
        onRestart("That sign-in attempt has ended. Enter your email and password again.");
        return;
      }
      form.setValue("code", "");
      setFormError(errorMessage(error));
    }
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <>
      <span className="bg-accent text-primary ring-primary/10 mb-6 grid size-12 place-items-center rounded-full ring-8">
        <KeyRound className="size-5" aria-hidden />
      </span>
      <AuthHeading
        title="Two-step verification"
        description={
          useRecovery
            ? "Enter one of the recovery codes you saved when you turned on two-step verification. Each code works once."
            : "Enter the 6-digit code from your authenticator app."
        }
      />
      <form
        method="post"
        className="grid gap-5"
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        noValidate
      >
        <FormError message={formError} />
        <FormField label={useRecovery ? "Recovery code" : "Authentication code"} error={errors.code?.message}>
          <Input
            autoComplete="one-time-code"
            inputMode={useRecovery ? "text" : "numeric"}
            placeholder={useRecovery ? "xxxx-xxxx-xxxx" : "123456"}
            className="font-mono text-lg tracking-[0.3em]"
            autoFocus
            {...form.register("code")}
          />
        </FormField>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Checking…" : "Verify and sign in"}
        </Button>
      </form>
      <div className="mt-6 flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          className="text-primary font-medium hover:underline"
          onClick={() => {
            setUseRecovery((v) => !v);
            setFormError(null);
            form.reset({ code: "" });
          }}
        >
          {useRecovery ? "Use your authenticator app instead" : "Lost your phone? Use a recovery code"}
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            onRestart();
          }}
        >
          Start again
        </button>
      </div>
    </>
  );
}

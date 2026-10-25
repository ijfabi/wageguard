"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { EmailOnlyRequestSchema, RegisterRequestSchema } from "@wageguard/api-contracts";
import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthHeading, CheckInbox, FormError, takeTokenFromHash } from "@/components/auth/auth-parts";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { keys } from "@/lib/api/hooks";

type RegisterValues = z.input<typeof RegisterRequestSchema>;

export function SignUpForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RegisterValues>({
    resolver: zodResolver(RegisterRequestSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: RegisterValues) {
    setFormError(null);
    try {
      await api.register(values);
      setSentTo(values.email.trim().toLowerCase());
    } catch (error: unknown) {
      setFormError(errorMessage(error));
    }
  }

  if (sentTo !== null) {
    return (
      <CheckInbox email={sentTo}>
        Open the link in it to confirm your address and finish creating your account.
      </CheckInbox>
    );
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <>
      <AuthHeading
        title="Create your account"
        description="Use a synthetic email address: this is a demonstration service."
      />
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
        <FormField
          label="Password"
          error={errors.password?.message}
          hint="At least 12 characters. A passphrase works well."
        >
          <Input type="password" autoComplete="new-password" {...form.register("password")} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="text-muted-foreground mt-8 text-center text-sm">
        Already have an account?{" "}
        <Link className="text-primary font-medium hover:underline" href="/sign-in">
          Sign in
        </Link>
      </p>
    </>
  );
}

/** Opens the emailed confirmation link: confirms the address and signs the user in. */
export function VerifyEmail() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"checking" | "missing" | { error: string }>("checking");
  // React's development double-invoke must not spend the single-use token twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const token = takeTokenFromHash();
    if (token === null) {
      // After this render, not during it: the hash is only readable in the browser.
      void Promise.resolve().then(() => {
        setState("missing");
      });
      return;
    }
    api
      .verifyEmail(token)
      .then((me) => {
        queryClient.setQueryData(keys.me, me);
        router.replace("/dashboard");
      })
      .catch((error: unknown) => {
        setState({ error: errorMessage(error) });
      });
  }, [queryClient, router]);

  if (state === "checking") {
    return (
      <div role="status" aria-live="polite">
        <AuthHeading title="Confirming your email…" description="This only takes a moment." />
      </div>
    );
  }
  return (
    <div>
      <span className="bg-danger-soft text-danger mb-6 grid size-12 place-items-center rounded-full">
        <CircleAlert className="size-5" aria-hidden />
      </span>
      <AuthHeading
        title="This link didn't work"
        description={
          state === "missing"
            ? "The link is incomplete. Open it straight from the email, or ask for a new one below."
            : `${state.error} Ask for a new link below.`
        }
      />
      <ResendForm />
    </div>
  );
}

function ResendForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<z.input<typeof EmailOnlyRequestSchema>>({
    resolver: zodResolver(EmailOnlyRequestSchema),
    defaultValues: { email: "" },
  });
  if (sentTo !== null) {
    return <CheckInbox email={sentTo} conditional title="New link on its way" />;
  }
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) =>
        void form.handleSubmit(async ({ email }) => {
          await api.resendVerification(email);
          setSentTo(email.trim().toLowerCase());
        })(e)
      }
      noValidate
    >
      <FormField label="Email" error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register("email")} />
      </FormField>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        Send a new link
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof EmailOnlyRequestSchema>>({
    resolver: zodResolver(EmailOnlyRequestSchema),
    defaultValues: { email: "" },
  });

  if (sentTo !== null) {
    return (
      <CheckInbox email={sentTo} conditional resend={() => api.requestPasswordReset(sentTo)}>
        The link in it lets you choose a new password for the next 30 minutes.
      </CheckInbox>
    );
  }
  return (
    <>
      <AuthHeading
        title="Reset your password"
        description="Enter the email you signed up with and we'll send you a link to choose a new password."
      />
      <form
        className="grid gap-5"
        onSubmit={(e) =>
          void form.handleSubmit(async ({ email }) => {
            setFormError(null);
            try {
              await api.requestPasswordReset(email);
              setSentTo(email.trim().toLowerCase());
            } catch (error: unknown) {
              setFormError(errorMessage(error));
            }
          })(e)
        }
        noValidate
      >
        <FormError message={formError} />
        <FormField label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register("email")} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
          Send reset link
        </Button>
      </form>
      <p className="text-muted-foreground mt-8 text-center text-sm">
        Remembered it?{" "}
        <Link className="text-primary font-medium hover:underline" href="/sign-in">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

const NewPasswordSchema = z
  .object({
    password: RegisterRequestSchema.shape.password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match", path: ["confirm"] });

export function ResetPasswordForm() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof NewPasswordSchema>>({
    resolver: zodResolver(NewPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  // React's development double-invoke must not read (and clear) the hash twice.
  const taken = useRef(false);
  useEffect(() => {
    if (taken.current) {
      return;
    }
    taken.current = true;
    // The hash is only readable in the browser, so the token arrives just after the first render.
    void Promise.resolve().then(() => {
      setToken(takeTokenFromHash());
    });
  }, []);

  if (done) {
    return (
      <div role="status">
        <span className="bg-info-soft text-info mb-6 grid size-12 place-items-center rounded-full">
          <CircleCheck className="size-5" aria-hidden />
        </span>
        <AuthHeading
          title="Password changed"
          description="You've been signed out everywhere. Sign in with your new password."
        />
        <Button asChild size="lg" className="w-full">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }
  if (token === null) {
    return (
      <>
        <AuthHeading
          title="This link didn't work"
          description="The link is incomplete or has already been used. Ask for a new one."
        />
        <Button asChild className="w-full">
          <Link href="/forgot-password">Get a new link</Link>
        </Button>
      </>
    );
  }
  const { errors, isSubmitting } = form.formState;
  return (
    <>
      <AuthHeading title="Choose a new password" description="This signs you out on every device." />
      <form
        method="post"
        className="grid gap-5"
        onSubmit={(e) =>
          void form.handleSubmit(async ({ password }) => {
            setFormError(null);
            try {
              await api.resetPassword(token ?? "", password);
              setDone(true);
            } catch (error: unknown) {
              setFormError(errorMessage(error));
            }
          })(e)
        }
        noValidate
      >
        <FormError message={formError} />
        <FormField label="New password" error={errors.password?.message} hint="At least 12 characters.">
          <Input type="password" autoComplete="new-password" {...form.register("password")} />
        </FormField>
        <FormField label="Confirm new password" error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || token === undefined}>
          {isSubmitting ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </>
  );
}

"use client";

import { MailCheck } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";

export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description === undefined ? null : (
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{description}</p>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (message === null) {
    return null;
  }
  return (
    <p role="alert" className="border-danger/30 bg-danger-soft text-danger rounded-lg border p-3 text-sm">
      {message}
    </p>
  );
}

/**
 * Shown after any request that sends an email. It never says whether the address has an account,
 * because the API doesn't say either.
 */
export function CheckInbox({
  email,
  title = "Check your inbox",
  children,
  resend: send = () => api.resendVerification(email),
  conditional = false,
}: {
  email: string;
  /** True when an email only goes out if the address has an account (password reset). */
  conditional?: boolean;
  title?: string;
  children?: ReactNode;
  /** Sends the email again. Defaults to a new confirmation link. */
  resend?: () => Promise<unknown>;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | { error: string }>("idle");
  async function resend() {
    setState("sending");
    try {
      await send();
      setState("sent");
    } catch (error: unknown) {
      setState({ error: errorMessage(error) });
    }
  }
  return (
    <div role="status" aria-live="polite">
      <span className="bg-accent text-primary ring-primary/10 mb-6 grid size-12 place-items-center rounded-full ring-8">
        <MailCheck className="size-5" aria-hidden />
      </span>
      <AuthHeading
        title={title}
        description={
          <>
            {conditional ? "If there’s an account for " : "We’ve sent an email to "}
            <strong className="text-foreground font-medium">{email}</strong>
            {conditional ? ", we’ve sent it an email. " : ". "}
            {children}
          </>
        }
      />
      <p className="text-muted-foreground text-sm leading-relaxed">
        Can&rsquo;t see it? Check your spam folder. Links expire, and only the newest one works.
      </p>
      <div className="mt-6">
        <Button
          variant="outline"
          onClick={() => void resend()}
          disabled={state === "sending" || state === "sent"}
        >
          {state === "sent"
            ? "Sent. Check again in a minute"
            : state === "sending"
              ? "Sending…"
              : "Send another link"}
        </Button>
        {typeof state === "object" ? <p className="text-danger mt-2 text-sm">{state.error}</p> : null}
      </div>
    </div>
  );
}

/** Reads `#token=…` from the address bar, then removes it so it isn't left in history. */
export function takeTokenFromHash(): string | null {
  const match = /(?:^|[#&])token=([A-Za-z0-9_-]{43})(?:&|$)/.exec(window.location.hash);
  if (match === null) {
    return null;
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return match[1] ?? null;
}

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode, type SyntheticEvent } from "react";
import { toast } from "sonner";

import { DisplayPreferencesForm } from "@/components/accessibility-menu";
import { DescriptionList } from "@/components/description-list";
import { PageHeader } from "@/components/page-header";
import { ChangePasswordForm, SessionList, TwoFactorSettings } from "@/components/security-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { useMe, useRuleVersions } from "@/lib/api/hooks";
import { formatDate, formatInstant, shortHash } from "@wageguard/presentation";

const CONFIRMATION = "delete my account";

/** A settings block: what it is on the left, the controls on the right. */
function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-x-10 gap-y-4 border-t py-8 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]"
    >
      <div>
        <h2 id={id} className="text-sm font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const me = useMe();
  const rules = useRuleVersions();

  return (
    <>
      <PageHeader title="Settings" description="Your account, security and display preferences." />
      <Card>
        <CardContent>
          <Section id="settings-account" title="Account" description="The address you sign in with.">
            <DescriptionList
              items={[
                [
                  "Email",
                  <span key="email" className="[overflow-wrap:anywhere]">
                    {me.data?.email}
                  </span>,
                ],
                ["Created", me.data === undefined ? "—" : formatInstant(me.data.createdAt)],
              ]}
            />
          </Section>
          <Section
            id="settings-password"
            title="Password"
            description="Changing it signs you out on every other device."
          >
            <ChangePasswordForm />
          </Section>
          <Section
            id="settings-two-factor"
            title="Two-step verification"
            description="Ask for a code from an authenticator app as well as your password when you sign in."
          >
            <TwoFactorSettings />
          </Section>
          <Section
            id="settings-sessions"
            title="Signed-in devices"
            description="Everywhere your account is signed in now. Sign out of anything you don't recognise."
          >
            <SessionList />
          </Section>
          <Section
            id="settings-display"
            title="Accessibility and display"
            description="Saved on this device. Also available from the Accessibility button on every page."
          >
            <DisplayPreferencesForm />
          </Section>
          <Section
            id="settings-rules"
            title="Award rule sets"
            description="The published, versioned rules WageGuard calculates with. A newer revision replaces an older one for the same dates."
          >
            <ul className="divide-border/70 divide-y rounded-lg border">
              {(rules.data?.items ?? []).map((r) => (
                <li key={r.version} className="px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-xs">
                    {r.version}
                    {r.supersededBy === null ? (
                      <span className="bg-info-soft text-info rounded-full px-2 py-0.5 font-sans font-medium">
                        In use
                      </span>
                    ) : (
                      <span className="bg-neutral-soft text-neutral rounded-full px-2 py-0.5 font-sans font-medium">
                        Replaced by {r.supersededBy.split("/").at(-1)}
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    From {formatDate(r.effectiveFrom)} · {r.enabledRuleCount} rules in use,{" "}
                    {r.disabledRuleCount} flagged for review · fingerprint {shortHash(r.fingerprint)}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
          <Section
            id="settings-data"
            title="Delete your data"
            description="Your shifts, payslips and audits are visible only to you. Deleting your account permanently removes all of them, including saved audits."
          >
            <DeleteAccount />
          </Section>
        </CardContent>
      </Card>
    </>
  );
}

function DeleteAccount() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const ready = password !== "" && confirmation.trim().toLowerCase() === CONFIRMATION;

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) {
      return;
    }
    setPending(true);
    try {
      await api.deleteAccount(password);
      queryClient.clear();
      router.replace("/");
    } catch (error: unknown) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </DialogTrigger>
      <DialogContent>
        {/* method="post" keeps the password out of the URL if submitted before hydration. */}
        <form method="post" onSubmit={(e) => void onSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your account, employments, shifts, payslips and audits. It cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="my-5 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="delete-password">Password</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="delete-confirm">Type &ldquo;{CONFIRMATION}&rdquo; to confirm</Label>
              <Input
                id="delete-confirm"
                value={confirmation}
                onChange={(e) => {
                  setConfirmation(e.target.value);
                }}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={!ready || pending}>
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

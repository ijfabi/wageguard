"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type SyntheticEvent } from "react";
import { toast } from "sonner";

import { DisplayPreferencesForm } from "@/components/accessibility-menu";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function SettingsPage() {
  const me = useMe();
  const rules = useRuleVersions();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              <h2>Accessibility and display</h2>
            </CardTitle>
            <CardDescription>
              Saved on this device. Also available from the Accessibility button on every page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DisplayPreferencesForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Account</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="[overflow-wrap:anywhere]">{me.data?.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{me.data === undefined ? "—" : formatInstant(me.data.createdAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Award rule sets</h2>
            </CardTitle>
            <CardDescription>The published, versioned rules WageGuard calculates with.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {(rules.data?.items ?? []).map((r) => (
                <li key={r.version}>
                  <p className="font-mono text-xs">{r.version}</p>
                  <p className="text-muted-foreground text-xs">
                    From {formatDate(r.effectiveFrom)} · {r.enabledRuleCount} rules in use,{" "}
                    {r.disabledRuleCount} flagged for review · fingerprint {shortHash(r.fingerprint)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              <h2>Your data</h2>
            </CardTitle>
            <CardDescription>
              Your shifts, payslips and audits are visible only to you. Deleting your account permanently
              removes all of them, including saved audits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteAccount />
          </CardContent>
        </Card>
      </div>
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

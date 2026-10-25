"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ChangePasswordRequestSchema, type TwoFactorSetupResponse } from "@wageguard/api-contracts";
import { Copy, Download, Laptop, ShieldCheck, ShieldOff } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
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
import { keys, useMe, useSessions } from "@/lib/api/hooks";
import { download } from "@/lib/download";
import { formatInstant } from "@wageguard/presentation";

type PasswordValues = z.input<typeof ChangePasswordRequestSchema>;

export function ChangePasswordForm() {
  const queryClient = useQueryClient();
  const form = useForm<PasswordValues>({
    resolver: zodResolver(ChangePasswordRequestSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <form
      method="post"
      className="grid max-w-md gap-4"
      onSubmit={(e) =>
        void form.handleSubmit(async (values) => {
          try {
            await api.changePassword(values.currentPassword, values.newPassword);
            form.reset();
            await queryClient.invalidateQueries({ queryKey: keys.sessions });
            toast.success("Password changed. Other devices have been signed out.");
          } catch (error: unknown) {
            toast.error(errorMessage(error));
          }
        })(e)
      }
      noValidate
    >
      <FormField label="Current password" error={errors.currentPassword?.message}>
        <Input type="password" autoComplete="current-password" {...form.register("currentPassword")} />
      </FormField>
      <FormField label="New password" error={errors.newPassword?.message} hint="At least 12 characters.">
        <Input type="password" autoComplete="new-password" {...form.register("newPassword")} />
      </FormField>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}

function RecoveryCodes({ codes }: { codes: readonly string[] }) {
  const text = `WageGuard recovery codes\nEach code works once.\n\n${codes.join("\n")}\n`;
  return (
    <div className="grid gap-3">
      <ul
        className="bg-muted grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg p-4 font-mono text-sm"
        aria-label="Recovery codes"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
          }}
        >
          <Copy aria-hidden />
          Copy
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            download(new Blob([text], { type: "text/plain" }), "wageguard-recovery-codes.txt");
          }}
        >
          <Download aria-hidden />
          Download
        </Button>
      </div>
    </div>
  );
}

type SetupStep =
  { kind: "password" } | { kind: "scan"; setup: TwoFactorSetupResponse } | { kind: "codes"; codes: string[] };

/** Turning two-step verification on: confirm the password, scan, prove it with a code, save the recovery codes. */
function EnableTwoFactor() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<SetupStep>({ kind: "password" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (step.kind === "scan") {
      void QRCode.toDataURL(step.setup.otpauthUri, { margin: 1, width: 192 }).then(setQr);
    }
  }, [step]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      if (step.kind === "password") {
        setStep({ kind: "scan", setup: await api.setupTwoFactor(password) });
        setPassword("");
      } else if (step.kind === "scan") {
        const { recoveryCodes } = await api.enableTwoFactor(code);
        // The account isn't refreshed until the dialog closes: refreshing now would switch this
        // section to its "on" state and take the recovery codes off screen before they're saved.
        setStep({ kind: "codes", codes: recoveryCodes });
      }
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          if (step.kind === "codes") {
            void queryClient.invalidateQueries({ queryKey: keys.me });
            void queryClient.invalidateQueries({ queryKey: keys.sessions });
          }
          setStep({ kind: "password" });
          setCode("");
          setQr(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <ShieldCheck aria-hidden />
          Turn on two-step verification
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step.kind === "codes" ? (
          <>
            <DialogHeader>
              <DialogTitle>Save your recovery codes</DialogTitle>
              <DialogDescription>
                Two-step verification is on, and other devices have been signed out. If you lose your phone,
                each of these codes lets you sign in once. They won&rsquo;t be shown again.
              </DialogDescription>
            </DialogHeader>
            <RecoveryCodes codes={step.codes} />
            <DialogFooter>
              <DialogClose asChild>
                <Button>I&rsquo;ve saved them</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form method="post" onSubmit={(e) => void submit(e)} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Turn on two-step verification</DialogTitle>
              <DialogDescription>
                {step.kind === "password"
                  ? "Confirm your password to start."
                  : "Scan the code with an authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password), then enter the 6-digit code it shows."}
              </DialogDescription>
            </DialogHeader>
            {step.kind === "password" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="tfa-password">Password</Label>
                <Input
                  id="tfa-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                  }}
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center gap-3">
                  {qr === null ? (
                    <div className="bg-muted size-48 animate-pulse rounded-lg" />
                  ) : (
                    // A data URL generated in the browser from the otpauth URI; nothing is fetched.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qr}
                      alt="QR code for your authenticator app"
                      width={192}
                      height={192}
                      className="rounded-lg border"
                    />
                  )}
                  <p className="text-muted-foreground text-center text-xs">
                    Can&rsquo;t scan it? Enter this key instead:
                    <span className="text-foreground mt-1 block font-mono text-sm break-all select-all">
                      {step.setup.secret.replace(/(.{4})/g, "$1 ").trim()}
                    </span>
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tfa-code">6-digit code</Label>
                  <Input
                    id="tfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="font-mono tracking-[0.3em]"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                    }}
                  />
                </div>
              </>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={pending || (step.kind === "password" ? password === "" : code.trim().length < 6)}
              >
                {pending ? "Checking…" : step.kind === "password" ? "Continue" : "Turn on"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Password plus a current code (or a recovery code), for turning two-step off or replacing recovery codes. */
function ConfirmWithCode({
  trigger,
  title,
  description,
  action,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  action: string;
  onConfirm: (password: string, code: string) => Promise<string[] | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPassword("");
          setCode("");
          setCodes(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {codes !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>New recovery codes</DialogTitle>
              <DialogDescription>Your old codes no longer work. Save these somewhere safe.</DialogDescription>
            </DialogHeader>
            <RecoveryCodes codes={codes} />
            <DialogFooter>
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form
            method="post"
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              setPending(true);
              onConfirm(password, code)
                .then((result) => {
                  if (result === undefined) {
                    setOpen(false);
                  } else {
                    setCodes(result);
                  }
                })
                .catch((error: unknown) => toast.error(errorMessage(error)))
                .finally(() => {
                  setPending(false);
                });
            }}
          >
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-password">Password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-code">Authenticator code or recovery code</Label>
              <Input
                id="confirm-code"
                autoComplete="one-time-code"
                className="font-mono"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending || password === "" || code.trim() === ""}>
                {pending ? "Checking…" : action}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TwoFactorSettings() {
  const me = useMe();
  const queryClient = useQueryClient();
  if (me.data === undefined) {
    return null;
  }
  if (!me.data.twoFactorEnabled) {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <ShieldOff className="size-4" aria-hidden />
          Off. Anyone with your password can sign in.
        </p>
        <EnableTwoFactor />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-info flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="size-4" aria-hidden />
        On. Signing in needs a code from your authenticator app.
      </p>
      <div className="flex flex-wrap gap-2">
        <ConfirmWithCode
          trigger={<Button variant="outline">New recovery codes</Button>}
          title="Replace recovery codes"
          description="Your current recovery codes will stop working."
          action="Replace codes"
          onConfirm={async (password, code) =>
            (await api.regenerateRecoveryCodes(password, code)).recoveryCodes
          }
        />
        <ConfirmWithCode
          trigger={<Button variant="outline">Turn off</Button>}
          title="Turn off two-step verification?"
          description="Signing in will only need your password."
          action="Turn off"
          onConfirm={async (password, code) => {
            await api.disableTwoFactor(password, code);
            await queryClient.invalidateQueries({ queryKey: keys.me });
            toast.success("Two-step verification is off");
            return undefined;
          }}
        />
      </div>
    </div>
  );
}

export function SessionList() {
  const sessions = useSessions();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.sessions });
  if (sessions.isPending) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (sessions.isError) {
    return <p className="text-danger text-sm">{errorMessage(sessions.error)}</p>;
  }
  const others = sessions.data.items.filter((s) => !s.current);
  return (
    <div className="grid gap-4">
      <ul className="divide-border/70 divide-y rounded-lg border">
        {sessions.data.items.map((s) => (
          <li key={s.id} className="flex items-center gap-4 px-4 py-3">
            <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
              <Laptop className="text-muted-foreground size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {s.device ?? "Unknown device"}
                {s.current ? (
                  <span className="bg-info-soft text-info ml-2 rounded-full px-2 py-0.5 text-xs font-medium">
                    This device
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground block text-xs">
                Signed in {formatInstant(s.createdAt)} · last active {formatInstant(s.lastSeenAt)}
              </span>
            </span>
            {s.current ? null : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void api
                    .revokeSession(s.id)
                    .then(refresh)
                    .catch((error: unknown) => toast.error(errorMessage(error)));
                }}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
      {others.length === 0 ? null : (
        <div>
          <Button
            variant="outline"
            onClick={() => {
              void api
                .revokeOtherSessions()
                .then(async () => {
                  await refresh();
                  toast.success("Signed out of every other device");
                })
                .catch((error: unknown) => toast.error(errorMessage(error)));
            }}
          >
            Sign out of all other devices
          </Button>
        </div>
      )}
    </div>
  );
}

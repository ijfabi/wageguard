"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { ErrorState, LoadingState } from "@/components/states";
import { isUnauthenticated } from "@/lib/api/client";
import { useMe } from "@/lib/api/hooks";

/** Authenticated area: confirms the session with the API and redirects to sign-in when it is not valid. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const signedOut = me.isError && isUnauthenticated(me.error);

  useEffect(() => {
    if (signedOut) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [signedOut, router, pathname]);

  if (me.isPending || signedOut) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <LoadingState label="Checking your session" />
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }
  return <AppShell email={me.data.email}>{children}</AppShell>;
}

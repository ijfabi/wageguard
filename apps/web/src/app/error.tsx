"use client";

import { Button } from "@/components/ui/button";

/** Last-resort boundary for unexpected rendering errors. Details are not shown to the user. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">An unexpected error occurred. Your data has not been changed.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}

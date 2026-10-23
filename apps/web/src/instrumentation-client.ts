import { z } from "zod";

/**
 * Zod compiles fast object parsers with `new Function` when it can, and probes for that once. The
 * strict CSP blocks it; Zod falls back safely, but the browser still reports the blocked probe as a
 * violation. `jitless` skips both the probe and the compilation. The probe runs when a schema is
 * constructed (at module load), so this must happen before any application module evaluates:
 * Next.js runs instrumentation-client.ts before the app's client code.
 */
z.config({ jitless: true });

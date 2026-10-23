/**
 * Content Security Policy for HTML responses, with a fresh nonce per request (set by proxy.ts).
 *
 * Scripts: only those carrying the nonce run. Next.js adds it to its own bootstrap and bundle
 * scripts, and 'strict-dynamic' extends trust to scripts those load. No 'unsafe-inline'.
 * Development also needs 'unsafe-eval' (React's error overlay); production never does.
 *
 * Styles keep 'unsafe-inline': Radix, Recharts and sonner set inline style attributes and inject
 * <style> elements at runtime, which nonces cannot cover. Style injection cannot run code, so the
 * script policy is where XSS is stopped.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** 128 random bits, base64-encoded. */
export function createNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

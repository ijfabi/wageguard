/** True if the string contains an ASCII control character (U+0000–U+001F or U+007F). */
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Validates a post-sign-in redirect target. Only same-site absolute paths are allowed, so a crafted
 * `?next=` parameter cannot send the user to another site (open redirect).
 */
export function safeRedirect(target: string | null | undefined, fallback = "/dashboard"): string {
  if (target === null || target === undefined) {
    return fallback;
  }
  const isRelativePath = target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\");
  return isRelativePath && !hasControlCharacters(target) && !target.includes("://") ? target : fallback;
}

/**
 * Reads sign-up links from Mailpit, the local mail catcher in the compose stacks. Accounts made
 * for benchmarks are confirmed exactly as a person would, by following the emailed link.
 */
export async function emailedToken(
  mailpitUrl: string,
  to: string,
  page: "verify-email" | "reset-password",
  timeoutMs = 15_000,
): Promise<string> {
  const pattern = new RegExp(`/${page}#token=([A-Za-z0-9_-]{43})`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${mailpitUrl}/api/v1/search?limit=5&query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    if (search.ok) {
      const { messages } = (await search.json()) as { messages: { ID: string }[] };
      for (const { ID } of messages) {
        const message = await fetch(`${mailpitUrl}/api/v1/message/${ID}`);
        const token = pattern.exec(((await message.json()) as { Text: string }).Text)?.[1];
        if (token !== undefined) {
          return token;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No ${page} email for ${to} within ${timeoutMs} ms`);
}

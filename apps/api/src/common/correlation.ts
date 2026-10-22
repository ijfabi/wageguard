import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const CORRELATION_HEADER = "x-correlation-id";
const ACCEPTABLE_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Request id for logs and error bodies. A well-formed incoming id is propagated (so a caller can
 * correlate across services); anything else is replaced, so log injection via the header is not
 * possible. The id is echoed in the response header.
 */
export function correlationId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[CORRELATION_HEADER];
  const id = typeof incoming === "string" && ACCEPTABLE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(CORRELATION_HEADER, id);
  return id;
}

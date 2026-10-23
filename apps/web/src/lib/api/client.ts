import { ErrorBodySchema, type ErrorBody } from "@wageguard/api-contracts";

type Issue = NonNullable<ErrorBody["error"]["issues"]>[number];

/** An error response from the API, carrying its documented code, issues and correlation id. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: readonly Issue[],
    readonly correlationId: string | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }

  /** Field-level messages keyed by request path (e.g. "payPeriod.endDate"), for form display. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      this.issues.filter((i) => i.path !== undefined).map((i) => [i.path ?? "", i.message]),
    );
  }
}

export interface RequestOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "DELETE";
  readonly body?: unknown;
  /** Raw text body (CSV upload). */
  readonly text?: { readonly content: string; readonly contentType: string };
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Same-origin requests to /api/v1 (rewritten to the API by next.config.ts), so the session cookie
 * is first-party and SameSite=Strict applies. Never sends credentials to another origin.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const query = Object.entries(options.query ?? {}).filter(
    (e): e is [string, string | number] => e[1] !== undefined,
  );
  const url = `/api/v1${path}${query.length === 0 ? "" : `?${new URLSearchParams(query.map(([k, v]) => [k, String(v)])).toString()}`}`;
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  let body: string | undefined;
  if (options.text !== undefined) {
    headers["Content-Type"] = options.text.contentType;
    body = options.text.content;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: body ?? null,
    credentials: "same-origin",
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw toError(response, payload);
  }
  return payload as T;
}

function toError(response: Response, payload: unknown): ApiRequestError {
  const parsed = ErrorBodySchema.safeParse(payload);
  if (parsed.success) {
    const { code, message, issues, correlationId } = parsed.data.error;
    return new ApiRequestError(response.status, code, message, issues ?? [], correlationId);
  }
  return new ApiRequestError(
    response.status,
    response.status >= 500 ? "INTERNAL_ERROR" : "UNEXPECTED_RESPONSE",
    response.status >= 500
      ? "The server could not complete the request. Please try again."
      : "Unexpected response from the server.",
    [],
    response.headers.get("x-correlation-id"),
  );
}

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

/** A human message for any error thrown by a request. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const detail = error.issues.length > 0 ? ` ${error.issues.map((i) => i.message).join(" ")}` : "";
    return `${error.message}.${detail}`.replace("..", ".");
  }
  return "Something went wrong. Check your connection and try again.";
}

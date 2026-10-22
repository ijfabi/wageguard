import { ApiErrorCode } from "@wageguard/api-contracts";

export interface ApiIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

/** An expected, client-facing error. Anything else becomes a 500 INTERNAL_ERROR. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: readonly ApiIssue[],
  ) {
    super(message);
    this.name = "ApiError";
  }

  static notFound(what: string): ApiError {
    // Same response whether the resource is missing or owned by someone else (no existence leak).
    return new ApiError(404, ApiErrorCode.NOT_FOUND, `${what} not found`);
  }

  static validation(issues: readonly ApiIssue[], message = "Request validation failed"): ApiError {
    return new ApiError(422, ApiErrorCode.VALIDATION_FAILED, message, issues);
  }
}

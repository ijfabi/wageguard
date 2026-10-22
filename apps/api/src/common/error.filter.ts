import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { ApiErrorCode, type ErrorBody } from "@wageguard/api-contracts";
import { DomainError, DomainValidationError } from "@wageguard/domain";
import type { Request, Response } from "express";
import type { Logger } from "pino";

import { ApiError, type ApiIssue } from "./api-error.js";

interface Mapped {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly issues?: readonly ApiIssue[];
}

/**
 * Converts every error into the single documented error body. Unexpected errors are logged with
 * the correlation id and returned as a generic 500: no stack traces or internal messages leak.
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();
    const correlationId = typeof request.id === "string" ? request.id : "unknown";

    const mapped = mapError(exception);
    if (mapped.status >= 500) {
      // pino-http attaches the request logger; it can be absent if the error preceded that middleware.
      const log = (request as { log?: Logger }).log;
      log?.error({ err: exception, correlationId }, "Unhandled error");
    }
    const body: ErrorBody = {
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.issues === undefined ? {} : { issues: [...mapped.issues] }),
        correlationId,
      },
    };
    response.status(mapped.status).json(body);
  }
}

export function mapError(exception: unknown): Mapped {
  if (exception instanceof ApiError) {
    return {
      status: exception.status,
      code: exception.code,
      message: exception.message,
      ...(exception.issues === undefined ? {} : { issues: exception.issues }),
    };
  }
  if (exception instanceof DomainValidationError) {
    return {
      status: 422,
      code: ApiErrorCode.VALIDATION_FAILED,
      message: "Input is not valid",
      issues: exception.issues,
    };
  }
  if (exception instanceof DomainError) {
    return {
      status: 422,
      code: ApiErrorCode.VALIDATION_FAILED,
      message: exception.message,
      issues: [exception.toIssue()],
    };
  }
  if (exception instanceof ThrottlerException) {
    return { status: 429, code: ApiErrorCode.RATE_LIMITED, message: "Too many requests; try again later" };
  }
  const bodyParser = bodyParserError(exception);
  if (bodyParser !== null) {
    return bodyParser;
  }
  const database = databaseError(exception);
  if (database !== null) {
    return database;
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === 404) {
      return { status, code: ApiErrorCode.NOT_FOUND, message: "Route not found" };
    }
    if (status < 500) {
      return { status, code: ApiErrorCode.VALIDATION_FAILED, message: exception.message };
    }
  }
  return { status: 500, code: ApiErrorCode.INTERNAL_ERROR, message: "An unexpected error occurred" };
}

/** Express/body-parser errors carry a `type` and `status`. */
function bodyParserError(exception: unknown): Mapped | null {
  if (exception === null || typeof exception !== "object" || !("type" in exception)) {
    return null;
  }
  switch (exception.type) {
    case "entity.too.large":
      return { status: 413, code: ApiErrorCode.PAYLOAD_TOO_LARGE, message: "Request body is too large" };
    case "entity.parse.failed":
      return { status: 400, code: ApiErrorCode.VALIDATION_FAILED, message: "Request body is not valid JSON" };
    case "encoding.unsupported":
    case "charset.unsupported":
      return {
        status: 415,
        code: ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
        message: "Unsupported request encoding",
      };
    default:
      return null;
  }
}

/**
 * Database constraint violations. Matched on constraint names and the trigger messages defined in
 * the migrations, which keeps this independent of the driver adapter's error class shapes.
 */
function databaseError(exception: unknown): Mapped | null {
  if (!(exception instanceof Error)) {
    return null;
  }
  const text = `${exception.message} ${safeStringify(exception)}`;
  if (text.includes("shifts_no_overlap")) {
    return {
      status: 409,
      code: ApiErrorCode.SHIFT_OVERLAP,
      message: "Shift overlaps another shift for this employment",
    };
  }
  if (text.includes("wageguard: completed audit records are immutable")) {
    return {
      status: 409,
      code: ApiErrorCode.VERSION_CONFLICT,
      message: "Completed audits cannot be changed",
    };
  }
  if (text.includes("wageguard: ownership")) {
    return { status: 409, code: ApiErrorCode.VERSION_CONFLICT, message: "Ownership cannot be changed" };
  }
  return null;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, Object.getOwnPropertyNames(value));
  } catch {
    return "";
  }
}

import { describe, expect, it } from "vitest";

import { mapError } from "../src/common/error.filter.js";

/** Builds an error shaped like the ones node-postgres and the Prisma adapter raise. */
function driverError(message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), extra);
}

describe("database connection failures", () => {
  it.each([
    ["refused connection", driverError("connect ECONNREFUSED 172.18.0.2:5432", { code: "ECONNREFUSED" })],
    ["database host gone from DNS", driverError("getaddrinfo ENOTFOUND postgres", { code: "ENOTFOUND" })],
    ["pool connect timeout", driverError("timeout exceeded when trying to connect")],
    [
      "server shutting down",
      driverError("terminating connection due to administrator command", { code: "57P01" }),
    ],
    ["server starting up", driverError("the database system is starting up", { code: "57P03" })],
    [
      "wrapped by the adapter",
      driverError("Driver adapter error", { cause: { message: "Connection terminated unexpectedly" } }),
    ],
  ])("%s -> 503 SERVICE_UNAVAILABLE with Retry-After", (_, error) => {
    expect(mapError(error)).toEqual({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      message: "The service is temporarily unavailable; try again shortly",
      retryAfterSeconds: 2,
    });
  });

  it("still reports genuinely unexpected errors as 500 without detail", () => {
    expect(mapError(new Error("Cannot read properties of undefined"))).toEqual({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
  });
});

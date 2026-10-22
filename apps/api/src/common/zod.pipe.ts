import type { PipeTransform } from "@nestjs/common";
import type { z } from "zod";

import { ApiError } from "./api-error.js";

/**
 * Validates and parses a request part against a contract schema from @wageguard/api-contracts.
 * Strict schemas reject unknown keys, so clients cannot smuggle extra fields (mass assignment).
 */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw ApiError.validation(
        result.error.issues.map((issue) => ({
          code: "INVALID_INPUT",
          message: issue.message,
          path: issue.path.map(String).join("."),
        })),
      );
    }
    return result.data;
  }
}

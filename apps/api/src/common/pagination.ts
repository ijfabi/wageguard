import { z } from "zod";

import { ApiError } from "./api-error.js";

/** Keyset cursor: the sort key and id of the last item returned. Opaque to clients (base64url JSON). */
const CursorSchema = z.strictObject({ k: z.string().max(64), id: z.uuid() });
export type Cursor = z.infer<typeof CursorSchema>;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(value: string | undefined): Cursor | null {
  if (value === undefined) {
    return null;
  }
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw ApiError.validation([
      { code: "INVALID_CURSOR", message: "Invalid pagination cursor", path: "cursor" },
    ]);
  }
}

/** Splits a "limit + 1" result into a page and the cursor for the next one. */
export function toPage<T, R>(
  rows: readonly T[],
  limit: number,
  cursorOf: (row: T) => Cursor,
  map: (row: T) => R,
): { items: R[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(map),
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(cursorOf(last)) : null,
  };
}

import { createHash } from "node:crypto";

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * Deterministic JSON: object keys sorted lexicographically, no whitespace, `undefined` properties
 * omitted. Two semantically equal values always produce byte-identical output, which makes the
 * result suitable for content hashes (input snapshots, rule-set fingerprints).
 *
 * Only finite integers are accepted as numbers: fractional values belong in decimal strings.
 */
export function canonicalJson(value: unknown): string {
  return serialise(toJsonCompatible(value), "$");
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** SHA-256 of the canonical JSON form of a value. */
export function contentHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

function toJsonCompatible(value: unknown): unknown {
  // Honour toJSON (Money, LocalDate, Interval...) exactly as JSON.stringify would.
  if (
    value !== null &&
    typeof value === "object" &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  ) {
    return (value.toJSON as () => unknown).call(value);
  }
  return value;
}

function serialise(raw: unknown, path: string): string {
  const value = toJsonCompatible(raw);
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new TypeError(`canonicalJson: non-integer number at ${path}; use a decimal string`);
      }
      return String(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item: unknown, i) => serialise(item, `${path}[${i}]`)).join(",")}]`;
      }
      if (value instanceof Map) {
        throw new TypeError(`canonicalJson: Map at ${path} is not JSON; convert to an object`);
      }
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${serialise(v, `${path}.${k}`)}`).join(",")}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof value} at ${path}`);
  }
}

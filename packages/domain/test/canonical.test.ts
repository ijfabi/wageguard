import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { LocalDate, Money, canonicalJson, contentHash, sha256Hex } from "../src/index.js";

describe("canonicalJson", () => {
  it("sorts keys at every depth and omits undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: true, y: null }], c: "x" }, u: undefined })).toBe(
      '{"a":{"c":"x","d":[3,{"y":null,"z":true}]},"b":1}',
    );
  });

  it("uses toJSON for value objects", () => {
    expect(canonicalJson({ pay: Money.of("1.5"), on: LocalDate.parse("2026-07-01") })).toBe(
      '{"on":"2026-07-01","pay":"1.50"}',
    );
  });

  it("rejects fractional numbers, Maps and unsupported types", () => {
    expect(() => canonicalJson({ rate: 27.81 })).toThrow(/decimal string/);
    expect(() => canonicalJson(new Map())).toThrow(/Map/);
    expect(() => canonicalJson({ f: () => 1 })).toThrow(/unsupported function/);
  });

  it("property: key insertion order never changes the hash", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean())), (dict) => {
        const reversed = Object.fromEntries(Object.entries(dict).reverse());
        expect(contentHash(reversed)).toBe(contentHash(dict));
      }),
    );
  });

  it("produces a known SHA-256", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

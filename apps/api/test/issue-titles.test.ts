import { ISSUE_DEFINITIONS } from "@wageguard/calculation-engine";
import { TITLED_ISSUE_CODES } from "@wageguard/presentation";
import { describe, expect, it } from "vitest";

describe("issue wording", () => {
  it("has a plain-language title for every issue the engine can raise", () => {
    const missing = Object.keys(ISSUE_DEFINITIONS).filter((code) => !TITLED_ISSUE_CODES.includes(code));
    expect(missing).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { toPdfText } from "../src/modules/audits/audit-pdf.js";

describe("toPdfText", () => {
  it("keeps everything the standard PDF fonts can draw", () => {
    expect(toPdfText("Café – “quoted” · $1,234.50 — ok…")).toBe("Café – “quoted” · $1,234.50 — ok…");
  });

  it("replaces characters outside Windows-1252 instead of drawing the wrong glyph", () => {
    expect(toPdfText("Shift 🕘 at 東京 store")).toBe("Shift ? at ?? store");
  });

  it("flattens control characters so user text cannot break the layout", () => {
    expect(toPdfText("line one\r\nline two\tend\u0007")).toBe("line one line two end?");
  });
});

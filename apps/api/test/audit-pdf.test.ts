import { describe, expect, it } from "vitest";

import { toPdfText } from "../src/modules/audits/audit-pdf.js";

describe("toPdfText", () => {
  it("keeps Western European punctuation", () => {
    expect(toPdfText("Café – “quoted” · $1,234.50 — ok…")).toBe("Café – “quoted” · $1,234.50 — ok…");
  });

  it("keeps the scripts the embedded font covers", () => {
    for (const text of ["Łódź Żabka", "Ελληνικό καφέ", "Кафе «Москва»", "חנות", "Nguyễn Văn"]) {
      expect(toPdfText(text), text).toBe(text);
    }
  });

  it("replaces characters the font has no glyph for instead of drawing an empty box", () => {
    expect(toPdfText("Shift 🕘 at 東京 store")).toBe("Shift ? at ?? store");
  });

  it("flattens control characters so user text cannot break the layout", () => {
    expect(toPdfText("line one\r\nline two\tend\u0007")).toBe("line one line two end?");
  });
});

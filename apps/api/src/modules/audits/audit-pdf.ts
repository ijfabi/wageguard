import { createRequire } from "node:module";

import type { AuditDetail, PayslipResponse } from "@wageguard/api-contracts";
import type { PayPeriodCalculationResult } from "@wageguard/calculation-engine";
import {
  FINDING_STATUS,
  calculationStatusPresentation,
  auditAmounts,
  formatAud,
  formatDate,
  formatInstant,
  formatMinutes,
  formatShiftSpan,
  humaniseShiftIds,
  issueTitle,
  type Tone,
} from "@wageguard/presentation";
import { openSync, type Font } from "fontkit";
import PDFDocument from "pdfkit";

export interface AuditPdfInput {
  readonly audit: AuditDetail;
  readonly calculation: PayPeriodCalculationResult;
  readonly payslip: PayslipResponse;
  /** ISO instant the report was generated (injected; the renderer never reads the clock). */
  readonly generatedAt: string;
  readonly disclaimer: string;
}

const MARGIN = 48;
/**
 * DejaVu Sans, embedded (subsetted by pdfkit). Unlike the 14 standard PDF fonts it covers Latin
 * Extended, Greek, Cyrillic, Hebrew and more, so names and descriptions in any of those scripts
 * print as typed instead of as "?".
 */
const require = createRequire(import.meta.url);
const FONT_FILES = {
  body: require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"),
  bold: require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"),
} as const;
const FONT = "body";
const BOLD = "bold";
const INK = "#1a1a1a";
const MUTED = "#555555";
const RULE = "#d0d0d0";
/** No green: even a match is information, because the rules are not professionally reviewed. */
const TONE_COLOURS: Readonly<Record<Tone, string>> = {
  info: "#2b519c",
  warning: "#8a5a00",
  danger: "#b42318",
  neutral: "#444444",
};

/** Both embedded faces come from the same family and cover the same characters. */
const BODY_FACE = openSync(FONT_FILES.body) as Font;

/**
 * Text as the embedded font can draw it: any character without a glyph (emoji, CJK and other
 * scripts DejaVu Sans doesn't cover) becomes "?" rather than an empty box, and line breaks and
 * control characters are flattened so user text can't break the layout.
 */
export function toPdfText(value: string): string {
  let out = "";
  for (const ch of value.replace(/[\r\n\t]+/g, " ")) {
    const code = ch.codePointAt(0) ?? 0;
    out += code >= 0x20 && code !== 0x7f && BODY_FACE.hasGlyphForCodePoint(code) ? ch : "?";
  }
  return out;
}

interface Column {
  readonly header: string;
  readonly width: number;
  readonly align?: "left" | "right";
}

/**
 * Renders the evidence report as an A4 PDF from an audit's immutable snapshot. Output depends only
 * on the input, so a stored audit always produces the same document content.
 */
export function renderAuditPdf(input: AuditPdfInput): Promise<Buffer> {
  const { audit, calculation, payslip } = input;
  const timeZone = calculation.metadata.timeZone;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    lang: "en-AU",
    displayTitle: true,
    info: {
      Title: `WageGuard audit report: ${audit.payPeriod.startDate} to ${audit.payPeriod.endDate}`,
      Author: "WageGuard",
      Subject: "Award minimum pay verification (informational, not legal advice)",
      CreationDate: new Date(input.generatedAt),
    },
  });
  doc.registerFont(FONT, FONT_FILES.body);
  doc.registerFont(BOLD, FONT_FILES.bold);
  doc.font(FONT);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);
  });

  const width = doc.page.width - MARGIN * 2;
  const bottom = (): number => doc.page.height - MARGIN - 24;
  const ensureSpace = (height: number): void => {
    if (doc.y + height > bottom()) {
      doc.addPage();
    }
  };
  const text = (
    value: string,
    options: { font?: string; size?: number; colour?: string; gap?: number } = {},
  ) => {
    doc
      .font(options.font ?? FONT)
      .fontSize(options.size ?? 10)
      .fillColor(options.colour ?? INK)
      .text(toPdfText(value), MARGIN, doc.y, { width });
    doc.moveDown(options.gap ?? 0.3);
  };
  const heading = (value: string): void => {
    ensureSpace(60);
    doc.moveDown(0.6);
    text(value, { font: BOLD, size: 13, gap: 0.4 });
  };
  const table = (
    columns: readonly Column[],
    rows: readonly (readonly string[])[],
    caption?: string,
  ): void => {
    const total = columns.reduce((sum, c) => sum + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * width);
    const pad = 4;
    const rowHeight = (cells: readonly string[], font: string): number => {
      doc.font(font).fontSize(9);
      return (
        Math.max(
          ...cells.map((cell, i) =>
            doc.heightOfString(toPdfText(cell), { width: (widths[i] ?? 0) - pad * 2 }),
          ),
        ) +
        pad * 2
      );
    };
    const drawRow = (cells: readonly string[], font: string, colour: string): void => {
      const height = rowHeight(cells, font);
      const top = doc.y;
      let x = MARGIN;
      cells.forEach((cell, i) => {
        const w = widths[i] ?? 0;
        doc
          .font(font)
          .fontSize(9)
          .fillColor(colour)
          .text(toPdfText(cell), x + pad, top + pad, {
            width: w - pad * 2,
            align: columns[i]?.align ?? "left",
          });
        x += w;
      });
      doc
        .moveTo(MARGIN, top + height)
        .lineTo(MARGIN + width, top + height)
        .lineWidth(0.5)
        .strokeColor(RULE)
        .stroke();
      doc.y = top + height;
    };
    const drawHeader = (): void => {
      drawRow(
        columns.map((c) => c.header),
        BOLD,
        MUTED,
      );
    };

    if (caption !== undefined) {
      ensureSpace(40);
      text(caption, { size: 9, colour: MUTED, gap: 0.2 });
    }
    ensureSpace(
      rowHeight(
        columns.map((c) => c.header),
        BOLD,
      ) + 20,
    );
    drawHeader();
    for (const row of rows) {
      if (doc.y + rowHeight(row, FONT) > bottom()) {
        doc.addPage();
        drawHeader();
      }
      drawRow(row, FONT, INK);
    }
    doc.x = MARGIN;
    doc.moveDown(0.6);
  };
  const shifts = calculation.shifts;
  const humanise = (message: string): string => humaniseShiftIds(message, shifts);

  // Title block
  text("WageGuard audit report", { font: BOLD, size: 20, gap: 0.2 });
  text(
    `Pay period ${formatDate(audit.payPeriod.startDate)} – ${formatDate(audit.payPeriod.endDate)} · ` +
      `${audit.shiftCount} ${audit.shiftCount === 1 ? "shift" : "shifts"}`,
    { size: 11, colour: MUTED, gap: 0.1 },
  );
  text(`Audit ${audit.id} · generated ${formatInstant(input.generatedAt, timeZone)}`, {
    size: 8,
    colour: MUTED,
    gap: 0.8,
  });

  // Result
  const status = FINDING_STATUS[audit.findingStatus];
  const [periodFinding, ...issueFindings] = audit.findings;
  const resultTop = doc.y;
  doc.x = MARGIN + 12;
  doc.y = resultTop + 10;
  const inner = width - 24;
  const resultText = (value: string, font: string, size: number, colour: string): void => {
    doc
      .font(font)
      .fontSize(size)
      .fillColor(colour)
      .text(toPdfText(value), MARGIN + 12, doc.y, { width: inner });
    doc.moveDown(0.25);
  };
  resultText(status.label, BOLD, 14, TONE_COLOURS[status.tone]);
  resultText(`Calculation: ${calculationStatusPresentation(audit).label}`, FONT, 9, MUTED);
  resultText(periodFinding?.explanation ?? status.description, FONT, 10, INK);
  if (periodFinding !== undefined) {
    resultText(`Next step: ${periodFinding.nextStep}`, BOLD, 10, INK);
  }
  const resultBottom = doc.y + 6;
  doc
    .rect(MARGIN, resultTop, width, resultBottom - resultTop)
    .lineWidth(1.5)
    .strokeColor(TONE_COLOURS[status.tone])
    .stroke();
  doc.x = MARGIN;
  doc.y = resultBottom + 12;

  // Amounts
  table(
    [
      { header: "", width: 3 },
      { header: "Amount", width: 2, align: "right" },
      { header: "Basis", width: 5 },
    ],
    auditAmounts(audit).map((a) => [a.label, a.value, a.detail]),
  );
  for (const note of audit.notes) {
    text(`• ${note}`, { size: 9, colour: MUTED, gap: 0.15 });
  }

  // Findings beyond the pay-period summary
  if (issueFindings.length > 0) {
    heading("Findings");
    for (const finding of issueFindings) {
      ensureSpace(50);
      text(`${FINDING_STATUS[finding.status].label}: ${issueTitle(finding.title)}`, {
        font: BOLD,
        size: 10,
        gap: 0.15,
      });
      text(humanise(finding.explanation), { size: 9, gap: 0.15 });
      text(`Next step: ${finding.nextStep}`, { size: 9, gap: 0.15 });
      if (finding.clauseRefs.length > 0) {
        text(`Award clauses: ${finding.clauseRefs.join(", ")}`, { size: 8, colour: MUTED, gap: 0.5 });
      }
    }
  }

  // Calculated pay lines
  heading("Calculated award minimum");
  if (calculation.lines.length === 0) {
    text("No shifts could be priced, so there are no pay lines.", { size: 9, colour: MUTED });
  } else {
    table(
      [
        { header: "Rule", width: 5 },
        { header: "Hours", width: 1.4, align: "right" },
        { header: "Rate", width: 1.4, align: "right" },
        { header: "Amount", width: 1.6, align: "right" },
        { header: "Clauses", width: 1.8 },
      ],
      [
        ...calculation.lines.map((line) => [
          `${line.description} (${line.percentOfMinimumHourlyRate}% of ${formatAud(line.baseHourlyRate)})`,
          line.hours,
          formatAud(line.hourlyRate),
          formatAud(line.amount),
          line.clauseRefs.join(", "),
        ]),
        ["Total (priced shifts)", "", "", formatAud(calculation.totals.amount), ""],
      ],
      `Rule set ${calculation.metadata.ruleSetVersion ?? "none"}. Amounts are computed from minutes; hours are shown to 4 decimal places.`,
    );
  }

  // Payslip as entered
  heading("Payslip as entered");
  table(
    [
      { header: "Category", width: 2 },
      { header: "Description", width: 5 },
      { header: "Amount", width: 2, align: "right" },
    ],
    [
      ...payslip.lines.map((line) => [
        line.category.replaceAll("_", " ").toLowerCase(),
        line.description,
        formatAud(line.amount),
      ]),
      ["Gross pay", "", formatAud(payslip.grossPay)],
    ],
  );

  // Shifts
  heading("Shifts");
  table(
    [
      { header: "Shift", width: 5 },
      { header: "Paid", width: 1.3, align: "right" },
      { header: "Unpaid break", width: 1.5, align: "right" },
      { header: "Indicative", width: 1.6, align: "right" },
      { header: "Issues", width: 3 },
    ],
    shifts.map((shift) => [
      formatShiftSpan(shift.localStart, shift.localEnd),
      formatMinutes(shift.paidMinutes),
      formatMinutes(shift.unpaidBreakMinutes),
      shift.indicativeAmount === null ? "Not priced" : formatAud(shift.indicativeAmount),
      shift.issueCodes.length === 0 ? "—" : shift.issueCodes.map(issueTitle).join("; "),
    ]),
    "Indicative amounts round each shift separately; the total above rounds per pay line.",
  );

  // Assumptions
  if (calculation.assumptions.length > 0) {
    heading("Assumptions");
    for (const assumption of calculation.assumptions) {
      text(`• ${assumption}`, { size: 9, gap: 0.15 });
    }
  }

  // Provenance
  const meta = calculation.metadata;
  heading("Provenance");
  table(
    [
      { header: "", width: 2 },
      { header: "", width: 6 },
    ],
    [
      [
        "Award",
        `${meta.awardCode}, ${issueTitle(meta.classificationCode)}, ${issueTitle(meta.employmentType).toLowerCase()}`,
      ],
      ["Rule set", `${meta.ruleSetVersion ?? "none"} (fingerprint ${meta.ruleSetFingerprint ?? "none"})`],
      [
        "Source",
        meta.sourceUrl === null
          ? "—"
          : `${meta.sourceUrl} (amendments to ${meta.sourceConsolidatedAsAt === null ? "—" : formatDate(meta.sourceConsolidatedAsAt)})`,
      ],
      ["Engine", meta.engineVersion],
      ["Input hash", meta.inputHash],
      ["Calculated at", formatInstant(meta.calculatedAt, timeZone)],
      ["Verification", meta.verification],
    ],
  );

  // Disclaimer
  heading("Important");
  text(input.disclaimer, { size: 9 });

  // Footer on every page. Margins are lifted temporarily so writing below the content area does
  // not trigger an automatic page break.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font(FONT)
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        toPdfText(`WageGuard · informational, not legal advice · page ${i + 1} of ${range.count}`),
        MARGIN,
        doc.page.height - MARGIN + 8,
        { width, align: "center", lineBreak: false },
      );
    doc.page.margins.bottom = saved;
  }
  doc.end();
  return done;
}

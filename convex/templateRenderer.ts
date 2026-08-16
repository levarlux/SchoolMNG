"use node";

/**
 * Template Renderer — PDF generation engine for document templates.
 *
 * Reads a template layout, resolves field values from student records
 * and EAV fieldValues, and generates a PDF using pdf-lib.
 *
 * This runs as a Convex action (Node.js runtime) since pdf-lib needs Node.
 */

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { PDFDocument, StandardFonts, rgb, PDFPage, RGB } from "pdf-lib";
import type { Id } from "./_generated/dataModel";

// ── Page size mappings ────────────────────────────────────────────

const PAGE_SIZES: Record<string, [number, number]> = {
  letter: [612, 792],
  a4: [595.28, 841.89],
  legal: [612, 1008],
};

// ── Color palette ─────────────────────────────────────────────────

const COLORS = {
  primary: rgb(0.15, 0.33, 0.55),      // school blue
  text: rgb(0.1, 0.1, 0.1),
  muted: rgb(0.4, 0.4, 0.4),
  heading: rgb(0.15, 0.25, 0.45),
  tableHeader: rgb(0.9, 0.92, 0.95),
  tableBorder: rgb(0.75, 0.78, 0.82),
  accent: rgb(0.1, 0.5, 0.1),
  white: rgb(1, 1, 1),
};

// ── Internal data resolution ──────────────────────────────────────

interface ResolvedData {
  student: Record<string, string | number | boolean | null>;
  fieldValues: Map<string, string>; // fieldId → value
  schoolName: string;
  schoolColor: string;
}

/**
 * Resolve field references in a layout section against actual data.
 * This runs server-side via internal queries to access the database.
 */
async function resolveData(
  ctx: any,
  schoolId: Id<"schools">,
  studentId?: Id<"students">,
): Promise<ResolvedData> {
  // Get school info
  const school = await ctx.runQuery(internal.templateQueries.getSchoolInfo, { schoolId });
  const schoolName = school?.name ?? "SchoolMNG";
  const schoolColor = school?.primaryColor ?? "#2563eb";

  const student: Record<string, string | number | boolean | null> = {};
  const fieldValues = new Map<string, string>();

  if (studentId) {
    // Get student typed core
    const studentDoc = await ctx.runQuery(internal.templateQueries.getStudentInfo, { studentId });
    if (studentDoc) {
      student.firstName = studentDoc.firstName;
      student.lastName = studentDoc.lastName;
      student.admNo = studentDoc.admNo;
      student.status = studentDoc.status ?? null;

      // Get class name
      if (studentDoc.classId) {
        const classDoc = await ctx.runQuery(internal.templateQueries.getClassInfo, { classId: studentDoc.classId });
        student.className = classDoc?.name ?? "";
      }

      // Get EAV field values for this student's record
      const record = await ctx.runQuery(internal.templateQueries.getRecordForStudent, { studentId });
      if (record) {
        const values = await ctx.runQuery(internal.templateQueries.getFieldValuesForRecord, { recordId: record._id });
        for (const fv of values) {
          fieldValues.set(fv.fieldId, fv.value);
        }
      }
    }
  }

  return { student, fieldValues, schoolName, schoolColor };
}

/**
 * Resolve a single field reference to its string value.
 */
function resolveFieldValue(
  ref: { fieldId?: string; value?: string; source?: string; studentKey?: string },
  data: ResolvedData,
): string {
  // Literal value — use as-is
  if (ref.source === "literal" || (!ref.fieldId && !ref.studentKey)) {
    return ref.value ?? "";
  }

  // Student typed core field
  if (ref.source === "student" && ref.studentKey) {
    const v = data.student[ref.studentKey];
    if (v === null || v === undefined) return "";
    return String(v);
  }

  // EAV field value
  if (ref.fieldId) {
    const val = data.fieldValues.get(ref.fieldId);
    return val ?? ref.value ?? "";
  }

  return ref.value ?? "";
}

// ── PDF Layout Engine ─────────────────────────────────────────────

interface RenderContext {
  pdfDoc: PDFDocument;
  page: PDFPage;
  helvetica: any;
  helveticaBold: any;
  width: number;
  height: number;
  margin: number;
  y: number; // current Y position (decreases as we draw)
  schoolColor: RGB;
  pageNum: number;
}

function ensureSpace(rc: RenderContext, needed: number): void {
  if (rc.y - needed < 60) {
    // New page
    rc.page = rc.pdfDoc.addPage([rc.width, rc.height]);
    rc.y = rc.height - rc.margin;
    rc.pageNum++;
  }
}

function drawText(
  rc: RenderContext,
  text: string,
  opts: { x: number; size?: number; font?: any; color?: RGB; maxWidth?: number },
): number {
  const font = opts.font ?? rc.helvetica;
  const size = opts.size ?? 10;
  const color = opts.color ?? COLORS.text;
  const maxWidth = opts.maxWidth ?? rc.width - rc.margin * 2;

  // Word-wrap if needed
  const words = text.split(" ");
  let line = "";
  let linesDrawn = 0;

  for (const word of words) {
    const testLine = line + word + " ";
    if (font.widthOfTextAtSize(testLine, size) > maxWidth && line.length > 0) {
      rc.page.drawText(line.trim(), {
        x: opts.x,
        y: rc.y,
        size,
        font,
        color,
      });
      rc.y -= size + 4;
      line = word + " ";
      linesDrawn++;
    } else {
      line = testLine;
    }
  }
  if (line.trim()) {
    rc.page.drawText(line.trim(), {
      x: opts.x,
      y: rc.y,
      size,
      font,
      color,
    });
    rc.y -= size + 4;
    linesDrawn++;
  }
  return linesDrawn;
}

function drawKeyValueSection(
  rc: RenderContext,
  fields: Array<{ label: string; fieldId?: string; value?: string; source?: string; studentKey?: string }>,
  data: ResolvedData,
): void {
  const colWidth = (rc.width - rc.margin * 2) / 2;

  for (let i = 0; i < fields.length; i += 2) {
    ensureSpace(rc, 30);

    const left = fields[i];
    const right = fields[i + 1];

    // Left column
    rc.page.drawText(`${left.label}:`, {
      x: rc.margin,
      y: rc.y,
      size: 10,
      font: rc.helveticaBold,
      color: COLORS.muted,
    });
    const leftValue = resolveFieldValue(left, data);
    rc.page.drawText(leftValue || "—", {
      x: rc.margin + 90,
      y: rc.y,
      size: 10,
      font: rc.helvetica,
      color: COLORS.text,
    });

    // Right column
    if (right) {
      rc.page.drawText(`${right.label}:`, {
        x: rc.margin + colWidth,
        y: rc.y,
        size: 10,
        font: rc.helveticaBold,
        color: COLORS.muted,
      });
      const rightValue = resolveFieldValue(right, data);
      rc.page.drawText(rightValue || "—", {
        x: rc.margin + colWidth + 90,
        y: rc.y,
        size: 10,
        font: rc.helvetica,
        color: COLORS.text,
      });
    }

    rc.y -= 20;
  }
}

function drawTableSection(
  rc: RenderContext,
  columns: Array<{ header: string; fieldId?: string; source?: string; studentKey?: string; value?: string }>,
  data: ResolvedData,
): void {
  if (columns.length === 0) return;

  const colWidth = (rc.width - rc.margin * 2) / columns.length;

  // Header row
  ensureSpace(rc, 40);
  rc.page.drawRectangle({
    x: rc.margin,
    y: rc.y - 5,
    width: rc.width - rc.margin * 2,
    height: 20,
    color: COLORS.tableHeader,
  });

  for (let i = 0; i < columns.length; i++) {
    rc.page.drawText(columns[i].header, {
      x: rc.margin + i * colWidth + 5,
      y: rc.y,
      size: 9,
      font: rc.helveticaBold,
      color: COLORS.heading,
    });
  }
  rc.y -= 22;

  // Data row (single record — for report cards this is one student)
  ensureSpace(rc, 20);
  for (let i = 0; i < columns.length; i++) {
    const val = resolveFieldValue(columns[i], data);
    rc.page.drawText(val || "—", {
      x: rc.margin + i * colWidth + 5,
      y: rc.y,
      size: 9,
      font: rc.helvetica,
      color: COLORS.text,
    });
  }
  rc.y -= 18;

  // Bottom border
  rc.page.drawLine({
    start: { x: rc.margin, y: rc.y },
    end: { x: rc.width - rc.margin, y: rc.y },
    thickness: 0.5,
    color: COLORS.tableBorder,
  });
  rc.y -= 10;
}

// ── Main Render Action ────────────────────────────────────────────

/**
 * Generate a PDF from a document template. Resolves field references
 * against the student's typed core and EAV fieldValues.
 *
 * Can be called from the client to generate individual documents,
 * or from batch operations for bulk generation.
 */
export const renderTemplate = action({
  args: {
    schoolId: v.id("schools"),
    templateId: v.id("doc_templates"),
    studentId: v.optional(v.id("students")),
    // For class_list: multiple students
    studentIds: v.optional(v.array(v.id("students"))),
    // For receipt: explicit data overrides
    receiptData: v.optional(v.object({
      receiptNumber: v.string(),
      studentName: v.string(),
      admNo: v.string(),
      amount: v.number(),
      method: v.string(),
      term: v.string(),
      date: v.string(),
    })),
    // For certificate: explicit data
    certificateData: v.optional(v.object({
      studentName: v.string(),
      achievement: v.string(),
      date: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // Fetch the template via internal query (actions can't use ctx.db)
    const template = await ctx.runQuery(internal.docTemplates.internalGet, {
      templateId: args.templateId,
    });
    if (!template) throw new Error("Template not found");

    const pageSize = PAGE_SIZES[template.pageSize ?? "letter"];
    const [pageWidth, pageHeight] = pageSize;
    const margin = 50;

    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Resolve school data
    const school = await ctx.runQuery(internal.templateQueries.getSchoolInfo, {
      schoolId: args.schoolId,
    });

    // Resolve student data if provided
    let studentData: ResolvedData = {
      student: {},
      fieldValues: new Map(),
      schoolName: school?.name ?? "SchoolMNG",
      schoolColor: school?.primaryColor ?? "#2563eb",
    };

    if (args.studentId) {
      studentData = await resolveData(ctx, args.schoolId, args.studentId);
    }

    const rc: RenderContext = {
      pdfDoc,
      page: pdfDoc.addPage([pageWidth, pageHeight]),
      helvetica,
      helveticaBold,
      width: pageWidth,
      height: pageHeight,
      margin,
      y: pageHeight - margin,
      schoolColor: hexToRgb(studentData.schoolColor),
      pageNum: 1,
    };

    // ── Document Header ───────────────────────────────────────
    // School name
    rc.page.drawText(studentData.schoolName, {
      x: margin,
      y: rc.y,
      size: 20,
      font: helveticaBold,
      color: rc.schoolColor,
    });
    rc.y -= 28;

    // Document title
    rc.page.drawText(template.layout.title, {
      x: margin,
      y: rc.y,
      size: 14,
      font: helvetica,
      color: COLORS.muted,
    });
    rc.y -= 18;

    // Subtitle
    if (template.layout.subtitle) {
      rc.page.drawText(template.layout.subtitle, {
        x: margin,
        y: rc.y,
        size: 11,
        font: helvetica,
        color: COLORS.muted,
      });
      rc.y -= 16;
    }

    // Divider line
    rc.page.drawLine({
      start: { x: margin, y: rc.y },
      end: { x: pageWidth - margin, y: rc.y },
      thickness: 1,
      color: rc.schoolColor,
    });
    rc.y -= 20;

    // ── Render Sections ───────────────────────────────────────
    for (const section of template.layout.sections) {
      if (section.kind === "spacer") {
        ensureSpace(rc, 20);
        rc.y -= 15;
        continue;
      }

      // Section heading
      if (section.heading) {
        ensureSpace(rc, 30);
        rc.page.drawText(section.heading, {
          x: margin,
          y: rc.y,
          size: 12,
          font: helveticaBold,
          color: COLORS.heading,
        });
        rc.y -= 18;

        // Underline
        rc.page.drawLine({
          start: { x: margin, y: rc.y },
          end: { x: pageWidth - margin, y: rc.y },
          thickness: 0.5,
          color: COLORS.tableBorder,
        });
        rc.y -= 12;
      }

      switch (section.kind) {
        case "key_value":
          if (section.fields) {
            drawKeyValueSection(rc, section.fields, studentData);
          }
          break;
        case "table":
          if (section.columns) {
            drawTableSection(rc, section.columns, studentData);
          }
          break;
        case "text":
          if (section.text) {
            ensureSpace(rc, 40);
            drawText(rc, section.text, {
              x: margin,
              size: 10,
              font: helvetica,
              color: COLORS.text,
              maxWidth: pageWidth - margin * 2,
            });
          }
          break;
      }
    }

    // ── Footer ────────────────────────────────────────────────
    const footerY = 40;
    rc.page.drawLine({
      start: { x: margin, y: footerY + 15 },
      end: { x: pageWidth - margin, y: footerY + 15 },
      thickness: 0.5,
      color: COLORS.tableBorder,
    });

    const footerText = template.layout.footer ?? `Generated on ${new Date().toLocaleDateString()}`;
    rc.page.drawText(footerText, {
      x: margin,
      y: footerY,
      size: 8,
      font: helvetica,
      color: COLORS.muted,
    });

    // Page number
    rc.page.drawText(`Page ${rc.pageNum}`, {
      x: pageWidth - margin - 40,
      y: footerY,
      size: 8,
      font: helvetica,
      color: COLORS.muted,
    });

    const pdfBytes = await pdfDoc.save();
    return Array.from(pdfBytes);
  },
});

// ── Helper: hex color to RGB ──────────────────────────────────────

function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return rgb(
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255,
    );
  }
  return rgb(0.15, 0.33, 0.55); // default blue
}


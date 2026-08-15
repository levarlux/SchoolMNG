/**
 * OCR Processing Module
 *
 * Handles document scanning and field extraction using the EAV metadata model.
 * The actual OCR runs client-side (Tesseract.js); this module provides:
 * - Field matching via aliases (for import/OCR column/header matching)
 * - Document type definitions and their target modules
 * - Batch write of OCR-extracted field values
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { requireSchoolMembership, logAuditEntry } from "./helpers";

// ── Document Type Definitions ───────────────────────────────────────

/**
 * Maps document types to their target bucket/module.
 * Used by the OCR pipeline to determine where extracted data should go.
 */
export const DOCUMENT_TYPES = {
  admission_form: {
    label: "Admission Form",
    bucket: "learner" as const,
    defaultModule: "Academics",
  },
  exam_paper: {
    label: "Exam Paper",
    bucket: "learner" as const,
    defaultModule: "Academics",
  },
  id_certificate: {
    label: "ID / Certificate",
    bucket: "learner" as const,
    defaultModule: "Documents",
  },
  fee_slip: {
    label: "Fee Slip",
    bucket: "learner" as const,
    defaultModule: "Finance",
  },
  medical_record: {
    label: "Medical Record",
    bucket: "learner" as const,
    defaultModule: "Health",
  },
  staff_contract: {
    label: "Staff Contract",
    bucket: "teaching_staff" as const,
    defaultModule: "HR & Performance",
  },
} as const;

export type DocumentType = keyof typeof DOCUMENT_TYPES;

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Get all available fields for a given bucket, grouped by module/section.
 * Used by the OCR confirmation screen to show the correct form layout.
 */
export const getFieldsForBucket = query({
  args: {
    schoolId: v.id("schools"),
    bucket: v.union(
      v.literal("learner"),
      v.literal("teaching_staff"),
      v.literal("non_teaching_staff"),
      v.literal("admin_staff"),
      v.literal("leadership"),
    ),
  },
  handler: async (ctx, { schoolId, bucket }) => {
    await requireSchoolMembership(ctx, schoolId);

    const modules = await ctx.db
      .query("modules")
      .withIndex("by_schoolId_bucket", (q) =>
        q.eq("schoolId", schoolId).eq("bucket", bucket)
      )
      .take(50);

    const moduleIds = new Set(modules.map((m) => m._id));
    // OPTIMIZATION: Use by_schoolId index instead of full-table .filter()
    const allSections = await ctx.db
      .query("sections")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
    const sections = allSections.filter((s) => moduleIds.has(s.moduleId));

    const sectionIds = new Set(sections.map((s) => s._id));
    const allFields = await ctx.db
      .query("fields")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(1000);
    const fields = allFields.filter((f) => sectionIds.has(f.sectionId));

    // Build nested structure
    return modules
      .sort((a, b) => a.order - b.order)
      .map((mod) => ({
        moduleId: mod._id,
        name: mod.name,
        sections: sections
          .filter((s) => s.moduleId === mod._id)
          .sort((a, b) => a.order - b.order)
          .map((sec) => ({
            sectionId: sec._id,
            name: sec.name,
            fields: fields
              .filter((f) => f.sectionId === sec._id)
              .sort((a, b) => a.order - b.order)
              .map((f) => ({
                fieldId: f._id,
                name: f.name,
                inputType: f.inputType,
                options: f.options,
                aliases: f.aliases,
                isRequired: f.isRequired,
              })),
          })),
      }));
  },
});

/**
 * Match extracted text labels/headers against field aliases.
 * Returns the best matches with confidence scores.
 */
export const matchFieldsToAliases = query({
  args: {
    schoolId: v.id("schools"),
    labels: v.array(v.string()),
  },
  handler: async (ctx, { schoolId, labels }) => {
    await requireSchoolMembership(ctx, schoolId);

    // Fetch all fields with their aliases
    const fields = await ctx.db
      .query("fields")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);

    const results: Array<{
      label: string;
      bestMatch: { fieldId: string; fieldName: string; score: number } | null;
      allMatches: Array<{ fieldId: string; fieldName: string; score: number }>;
    }> = [];

    for (const label of labels) {
      const normalizedLabel = label.toLowerCase().trim();
      const matches: Array<{ fieldId: string; fieldName: string; score: number }> = [];

      for (const field of fields) {
        // Check direct name match
        const normalizedName = field.name.toLowerCase().trim();
        let score = 0;

        if (normalizedName === normalizedLabel) {
          score = 3;
        } else if (
          normalizedName.includes(normalizedLabel) ||
          normalizedLabel.includes(normalizedName)
        ) {
          score = 2;
        }

        // Check aliases
        for (const alias of field.aliases) {
          const normalizedAlias = alias.toLowerCase().trim();
          if (normalizedAlias === normalizedLabel) {
            score = Math.max(score, 3);
          } else if (
            normalizedAlias.includes(normalizedLabel) ||
            normalizedLabel.includes(normalizedAlias)
          ) {
            score = Math.max(score, 2);
          } else {
            // Fuzzy: check if most words match
            const labelWords = normalizedLabel.split(/\s+/);
            const aliasWords = normalizedAlias.split(/\s+/);
            const matchingWords = labelWords.filter((w) =>
              aliasWords.some((aw) => aw.includes(w) || w.includes(aw))
            );
            if (matchingWords.length >= Math.ceil(labelWords.length * 0.6)) {
              score = Math.max(score, 1);
            }
          }
        }

        if (score > 0) {
          matches.push({ fieldId: field._id, fieldName: field.name, score });
        }
      }

      matches.sort((a, b) => b.score - a.score);
      results.push({
        label,
        bestMatch: matches[0] ?? null,
        allMatches: matches.slice(0, 5),
      });
    }

    return results;
  },
});

/**
 * Phase 2.2 — match a scanned/uploaded document against existing student
 * records by name tokens found in the OCR text, and flag when a document
 * of the same category is already applied to that student
 * ("this document is already applied to <student>").
 *
 * Best-effort: `student_documents.category` is free text (e.g. "Birth
 * Certificate", "national_id"), so the comparison is loose and may
 * under-match for vocabularies it can't bridge.
 */
function documentTypeMatches(category: string, documentType: string): boolean {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const a = norm(category);
  const b = norm(documentType);
  return a !== "" && b !== "" && (a === b || a.includes(b) || b.includes(a));
}

export const matchDocumentToStudent = query({
  args: {
    schoolId: v.id("schools"),
    text: v.string(),
    documentType: v.string(),
  },
  handler: async (ctx, { schoolId, text, documentType }) => {
    await requireSchoolMembership(ctx, schoolId);
    if (!text.trim()) return { candidates: [] };

    const [students, docs] = await Promise.all([
      ctx.db
        .query("students")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .take(2000),
      ctx.db
        .query("student_documents")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .take(2000),
    ]);
    const docsByStudent = new Map<string, Doc<"student_documents">[]>();
    for (const d of docs) {
      const arr = docsByStudent.get(d.studentId) ?? [];
      arr.push(d);
      docsByStudent.set(d.studentId, arr);
    }

    // Score each student by what fraction of their name tokens appear in
    // the extracted text (2+ char tokens only, to skip initials noise).
    const textLower = text.toLowerCase();
    const scored = students
      .map((s) => {
        const tokens = `${s.firstName} ${s.lastName}`
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length >= 2);
        if (tokens.length === 0) return { student: s, score: 0 };
        const present = tokens.filter((t) => textLower.includes(t)).length;
        return { student: s, score: present / tokens.length };
      })
      .filter((x) => x.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return {
      candidates: scored.map(({ student, score }) => {
        const studentDocs = docsByStudent.get(student._id) ?? [];
        return {
          studentId: student._id,
          name: `${student.firstName} ${student.lastName}`,
          admNo: student.admNo,
          score,
          alreadyApplied: studentDocs.some((d) => documentTypeMatches(d.category, documentType)),
          existingCategories: [...new Set(studentDocs.map((d) => d.category))],
        };
      }),
    };
  },
});

// ── Mutations ───────────────────────────────────────────────────────

/**
 * Write OCR-extracted field values for a record.
 * This is the final step after the user confirms the OCR extraction.
 */
export const saveOcrExtraction = mutation({
  args: {
    schoolId: v.id("schools"),
    recordId: v.id("records"),
    fieldValues: v.array(
      v.object({
        fieldId: v.id("fields"),
        value: v.string(),
      })
    ),
    sourceImage: v.optional(v.string()), // File storage ID or base64
    documentType: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    // Verify the record belongs to this school
    const record = await ctx.db.get(args.recordId);
    if (!record || record.schoolId !== args.schoolId) {
      throw new Error("Record not found in this school");
    }

    // Write each field value
    for (const fv of args.fieldValues) {
      const field = await ctx.db.get(fv.fieldId);
      if (!field || field.schoolId !== args.schoolId) {
        throw new Error("Field not found in this school");
      }

      // Check if value already exists for this record+field
      const existing = await ctx.db
        .query("fieldValues")
        .withIndex("by_recordId_fieldId", (q) =>
          q.eq("recordId", args.recordId).eq("fieldId", fv.fieldId)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { value: fv.value });
      } else {
        await ctx.db.insert("fieldValues", {
          schoolId: args.schoolId,
          recordId: args.recordId,
          fieldId: fv.fieldId,
          value: fv.value,
        });
      }
    }

    // Log the audit entry
    await logAuditEntry(ctx, args.schoolId, "ocr.saveExtraction", {
      recordId: args.recordId,
      documentType: args.documentType,
      fieldCount: args.fieldValues.length,
    });

    return { success: true, fieldCount: args.fieldValues.length };
  },
});

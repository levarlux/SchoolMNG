import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Template Seed — creates default document templates for a school.
 *
 * Called once during onboarding or on first access. Templates use
 * field references by ID, so they need the school's actual EAV fields
 * to be resolved. For new schools with bare module shells, the templates
 * are created with literal fallback values that show the structure;
 * schools replace them with their own field references once they build
 * their data structure in Settings → Data Structure.
 */

const DEFAULT_TEMPLATES = [
  {
    name: "Student Report Card",
    docType: "report_card" as const,
    description: "Standard report card with student details and subject results",
    isDefault: true,
    layout: {
      title: "Student Report Card",
      subtitle: "Academic Performance Summary",
      sections: [
        {
          heading: "Student Information",
          kind: "key_value" as const,
          fields: [
            { label: "Full Name", source: "student" as const, studentKey: "firstName", value: "" },
            { label: "Admission No", source: "student" as const, studentKey: "admNo", value: "" },
            { label: "Class", source: "student" as const, studentKey: "className", value: "" },
            { label: "Status", source: "student" as const, studentKey: "status", value: "" },
          ],
        },
        {
          heading: "Subject Results",
          kind: "table" as const,
          columns: [
            { header: "Subject", source: "literal" as const, value: "—" },
            { header: "Marks", source: "literal" as const, value: "—" },
            { header: "Grade", source: "literal" as const, value: "—" },
            { header: "Comment", source: "literal" as const, value: "—" },
          ],
          tableSource: "exam_results" as const,
        },
        {
          heading: "Teacher's Comment",
          kind: "text" as const,
          text: "Add your comment here...",
        },
        {
          heading: "Headteacher's Comment",
          kind: "text" as const,
          text: "Add your comment here...",
        },
      ],
      footer: "SchoolMNG — Student Report Card",
    },
  },
  {
    name: "Fee Payment Receipt",
    docType: "receipt" as const,
    description: "Payment receipt for school fees",
    isDefault: true,
    layout: {
      title: "Fee Payment Receipt",
      subtitle: "Official Payment Confirmation",
      sections: [
        {
          kind: "spacer" as const,
        },
        {
          heading: "Receipt Details",
          kind: "key_value" as const,
          fields: [
            { label: "Receipt No", source: "literal" as const, value: "—" },
            { label: "Date", source: "literal" as const, value: "" },
            { label: "Student Name", source: "student" as const, studentKey: "firstName", value: "" },
            { label: "Adm No", source: "student" as const, studentKey: "admNo", value: "" },
            { label: "Term", source: "literal" as const, value: "" },
            { label: "Amount Paid", source: "literal" as const, value: "" },
            { label: "Payment Method", source: "literal" as const, value: "" },
            { label: "Reference", source: "literal" as const, value: "" },
          ],
        },
        {
          kind: "spacer" as const,
        },
        {
          kind: "text" as const,
          text: "Thank you for your payment. This receipt serves as proof of payment.",
        },
      ],
      footer: "SchoolMNG — Fee Payment Receipt",
    },
  },
  {
    name: "Class List",
    docType: "class_list" as const,
    description: "Student list for a class with basic details",
    isDefault: true,
    layout: {
      title: "Class List",
      subtitle: "Student Register",
      sections: [
        {
          heading: "Class Information",
          kind: "key_value" as const,
          fields: [
            { label: "Class", source: "student" as const, studentKey: "className", value: "" },
            { label: "Total Students", source: "literal" as const, value: "" },
          ],
        },
        {
          heading: "Students",
          kind: "table" as const,
          columns: [
            { header: "#", source: "literal" as const, value: "" },
            { header: "Name", source: "student" as const, studentKey: "firstName", value: "" },
            { header: "Adm No", source: "student" as const, studentKey: "admNo", value: "" },
            { header: "Status", source: "student" as const, studentKey: "status", value: "" },
          ],
          tableSource: "field_values" as const,
        },
      ],
      footer: "SchoolMNG — Class List",
    },
  },
  {
    name: "Certificate of Achievement",
    docType: "certificate" as const,
    description: "Certificate awarded for academic or extracurricular achievement",
    isDefault: true,
    layout: {
      title: "Certificate of Achievement",
      subtitle: "This is to certify that",
      sections: [
        {
          kind: "spacer" as const,
        },
        {
          kind: "text" as const,
          text: "This is to certify that the student named below has achieved the following:",
        },
        {
          heading: "Recipient",
          kind: "key_value" as const,
          fields: [
            { label: "Student Name", source: "student" as const, studentKey: "firstName", value: "" },
            { label: "Admission No", source: "student" as const, studentKey: "admNo", value: "" },
            { label: "Class", source: "student" as const, studentKey: "className", value: "" },
          ],
        },
        {
          heading: "Achievement",
          kind: "text" as const,
          text: "Describe the achievement here...",
        },
        {
          kind: "spacer" as const,
        },
        {
          heading: "Signatures",
          kind: "key_value" as const,
          fields: [
            { label: "Date", source: "literal" as const, value: "" },
            { label: "Headteacher", source: "literal" as const, value: "" },
          ],
        },
      ],
      footer: "SchoolMNG — Certificate of Achievement",
    },
  },
] as const;

/**
 * Seed default document templates for a school.
 * Idempotent — skips if templates already exist for this school.
 */
export const seedDefaults = internalMutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    // Check if templates already exist
    const existing = await ctx.db
      .query("doc_templates")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(1);
    if (existing.length > 0) return 0; // already seeded

    const now = Date.now();
    let count = 0;
    for (const tmpl of DEFAULT_TEMPLATES) {
      await ctx.db.insert("doc_templates", {
        schoolId,
        name: tmpl.name,
        docType: tmpl.docType,
        description: tmpl.description,
        layout: tmpl.layout as any, // layout is deeply typed, cast for insert
        pageSize: "letter",
        isDefault: tmpl.isDefault,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      });
      count++;
    }
    return count;
  },
});

/**
 * Check if a school has document templates; seed if not.
 * Called lazily from the UI on first document generation access.
 */
/**
 * Internal version for use from onboarding.ts (called via internal.*).
 */
export const ensureTemplatesInternal = internalMutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const existing = await ctx.db
      .query("doc_templates")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(1);
    if (existing.length > 0) return false;

    await ctx.runMutation(internal.templateSeed.seedDefaults, { schoolId });
    return true;
  },
});

/**
 * Public version for use from the frontend (called via api.*).
 */
export const ensureTemplates = mutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const existing = await ctx.db
      .query("doc_templates")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(1);
    if (existing.length > 0) return false;

    await ctx.runMutation(internal.templateSeed.seedDefaults, { schoolId });
    return true;
  },
});

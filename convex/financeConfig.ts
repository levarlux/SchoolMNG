import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requirePrincipal, logAuditEntry } from "./helpers";
import type { Id, Doc } from "./_generated/dataModel";

// ── Queries ───────────────────────────────────────────────────────

/** Get the finance config for a school. */
export const get = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("fee_config")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
  },
});

/** Internal version for use by actions. */
export const internalGet = internalQuery({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    return await ctx.db
      .query("fee_config")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
  },
});

/** List all fields tagged with semantic "amount" for a school, for the config UI. */
export const listAmountFields = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    const fields = await ctx.db
      .query("fields")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
    return fields.filter(
      (f) => !f.deletedAt && f.semantic === "amount" && f.isEnabled !== false
    );
  },
});

/** List all fields tagged with semantic "date" for a school. */
export const listDateFields = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    const fields = await ctx.db
      .query("fields")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
    return fields.filter(
      (f) => !f.deletedAt && f.semantic === "date" && f.isEnabled !== false
    );
  },
});

// ── Mutations ─────────────────────────────────────────────────────

/** Create or update the finance config for a school. */
export const upsert = mutation({
  args: {
    schoolId: v.id("schools"),
    amountFieldId: v.optional(v.id("fields")),
    dueDateFieldId: v.optional(v.id("fields")),
    categoryFieldId: v.optional(v.id("fields")),
    discountFieldId: v.optional(v.id("fields")),
    useEavForFees: v.boolean(),
    useEavForPayments: v.boolean(),
    moduleId: v.optional(v.id("modules")),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const now = Date.now();

    const existing = await ctx.db
      .query("fee_config")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        amountFieldId: args.amountFieldId,
        dueDateFieldId: args.dueDateFieldId,
        categoryFieldId: args.categoryFieldId,
        discountFieldId: args.discountFieldId,
        useEavForFees: args.useEavForFees,
        useEavForPayments: args.useEavForPayments,
        moduleId: args.moduleId,
        updatedAt: now,
      });
      await logAuditEntry(ctx, args.schoolId, "financeConfig.updated", args);
      return existing._id;
    } else {
      const id = await ctx.db.insert("fee_config", {
        schoolId: args.schoolId,
        amountFieldId: args.amountFieldId,
        dueDateFieldId: args.dueDateFieldId,
        categoryFieldId: args.categoryFieldId,
        discountFieldId: args.discountFieldId,
        useEavForFees: args.useEavForFees,
        useEavForPayments: args.useEavForPayments,
        moduleId: args.moduleId,
        createdAt: now,
        updatedAt: now,
      });
      await logAuditEntry(ctx, args.schoolId, "financeConfig.created", args);
      return id;
    }
  },
});

// ── EAV Fee Resolution ────────────────────────────────────────────
// These internal functions read fee amounts from EAV fieldValues when
// the school has configured useEavForFees = true.

/**
 * Resolve the fee amount for a student from EAV fieldValues.
 * Looks up the student's record, finds the configured amount field,
 * and returns its value as a number.
 */
export const resolveEavFeeAmount = internalQuery({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
  },
  handler: async (ctx, { schoolId, studentId }) => {
    const config = await ctx.db
      .query("fee_config")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (!config || !config.useEavForFees || !config.amountFieldId) return null;

    // Find the student's EAV record
    const record = await ctx.db
      .query("records")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .first();
    if (!record) return null;

    // Look up the field value
    const fieldValue = await ctx.db
      .query("fieldValues")
      .withIndex("by_recordId_fieldId", (q) =>
        q.eq("recordId", record._id).eq("fieldId", config.amountFieldId!)
      )
      .first();
    if (!fieldValue) return null;

    const amount = parseFloat(fieldValue.value);
    return isNaN(amount) ? null : amount;
  },
});

/**
 * Resolve all EAV fee amounts for a school's students in a given term.
 * Returns a Map<studentId, amount> for students who have an EAV fee amount.
 */
export const resolveEavFeeAmounts = internalQuery({
  args: {
    schoolId: v.id("schools"),
    studentIds: v.array(v.id("students")),
  },
  handler: async (ctx, { schoolId, studentIds }) => {
    const config = await ctx.db
      .query("fee_config")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (!config || !config.useEavForFees || !config.amountFieldId) {
      return new Map<string, number>();
    }

    const result = new Map<string, number>();
    // Batch: get all records for these students
    for (const studentId of studentIds) {
      const record = await ctx.db
        .query("records")
        .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
        .first();
      if (!record) continue;

      const fieldValue = await ctx.db
        .query("fieldValues")
        .withIndex("by_recordId_fieldId", (q) =>
          q.eq("recordId", record._id).eq("fieldId", config.amountFieldId!)
        )
        .first();
      if (fieldValue) {
        const amount = parseFloat(fieldValue.value);
        if (!isNaN(amount)) {
          result.set(studentId, amount);
        }
      }
    }
    return result;
  },
});

/**
 * Get the total expected fees for a school using the EAV engine.
 * When useEavForFees is true, sums the EAV amount field values across
 * all students. Otherwise returns null (caller should use fee_structures).
 */
export const computeEavExpectedFees = internalQuery({
  args: {
    schoolId: v.id("schools"),
  },
  handler: async (ctx, { schoolId }) => {
    const config = await ctx.db
      .query("fee_config")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (!config || !config.useEavForFees || !config.amountFieldId) return null;

    // Get all active learner records
    const records = await ctx.db
      .query("records")
      .withIndex("by_schoolId_bucket", (q) =>
        q.eq("schoolId", schoolId).eq("bucket", "learner")
      )
      .take(10000);

    let totalExpected = 0;
    let studentsWithFees = 0;

    for (const record of records) {
      if (record.deletedAt) continue;
      const fieldValue = await ctx.db
        .query("fieldValues")
        .withIndex("by_recordId_fieldId", (q) =>
          q.eq("recordId", record._id).eq("fieldId", config.amountFieldId!)
        )
        .first();
      if (fieldValue) {
        const amount = parseFloat(fieldValue.value);
        if (!isNaN(amount) && amount > 0) {
          totalExpected += amount;
          studentsWithFees++;
        }
      }
    }

    return {
      totalExpected,
      studentsWithFees,
      source: "eav" as const,
    };
  },
});

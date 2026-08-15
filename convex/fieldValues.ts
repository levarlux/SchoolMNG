import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireFieldViewAccess, requireFieldEditAccess, logAuditEntry } from "./helpers";

/**
 * Get all field values for a record, joined with field metadata.
 * Returns an array of { fieldId, fieldName, inputType, value, options }.
 */
export const getValuesForRecord = query({
  args: { recordId: v.id("records") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record) throw new Error("Record not found");
    await requireSchoolMembership(ctx, record.schoolId);

    const values = await ctx.db
      .query("fieldValues")
      .withIndex("by_recordId", (q) => q.eq("recordId", args.recordId))
      .take(500);

    // Join with field metadata + enforce view access per field
    const result: Array<{
      fieldId: any;
      fieldDocId: any;
      fieldName: string;
      inputType: string;
      value: string;
      options: string[] | undefined;
      isRequired: boolean;
    }> = [];
    for (const fv of values) {
      const field = await ctx.db.get(fv.fieldId);
      if (field) {
        // Enforce view access on each field (cascades field → section → module)
        await requireFieldViewAccess(ctx, record.schoolId, fv.fieldId);
        result.push({
          fieldId: fv._id,
          fieldDocId: fv.fieldId,
          fieldName: field.name,
          inputType: field.inputType,
          value: fv.value,
          options: field.options,
          isRequired: field.isRequired,
        });
      }
    }
    return result;
  },
});

/**
 * Get a single field value for a record by field ID.
 */
export const getValue = query({
  args: { recordId: v.id("records"), fieldId: v.id("fields") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record) throw new Error("Record not found");
    await requireSchoolMembership(ctx, record.schoolId);
    await requireFieldViewAccess(ctx, record.schoolId, args.fieldId);

    const fv = await ctx.db
      .query("fieldValues")
      .withIndex("by_recordId_fieldId", (q) =>
        q.eq("recordId", args.recordId).eq("fieldId", args.fieldId)
      )
      .first();
    return fv?.value ?? null;
  },
});

/**
 * Get all field values for a list of records (bulk read).
 * Useful for list views where you need specific fields across many records.
 */
export const getValuesForRecords = query({
  args: {
    recordIds: v.array(v.id("records")),
    fieldIds: v.optional(v.array(v.id("fields"))),
  },
  handler: async (ctx, args) => {
    const results: Record<string, Record<string, string>> = {} as Record<string, Record<string, string>>;
    for (const recordId of args.recordIds) {
      const record = await ctx.db.get(recordId);
      if (!record) continue;
      results[recordId as string] = {};
    }

    // Cache view-access checks to avoid redundant lookups
    const accessChecked = new Set<string>();

    // Fetch all fieldValues for these records
    for (const recordId of args.recordIds) {
      const record = await ctx.db.get(recordId);
      if (!record) continue;
      const values = await ctx.db
        .query("fieldValues")
        .withIndex("by_recordId", (q) => q.eq("recordId", recordId))
        .take(500);
      for (const fv of values) {
        if (args.fieldIds && !args.fieldIds.includes(fv.fieldId)) continue;
        // Enforce view access per field (cached per fieldId)
        const fieldKey = fv.fieldId as string;
        if (!accessChecked.has(fieldKey)) {
          await requireFieldViewAccess(ctx, record.schoolId, fv.fieldId);
          accessChecked.add(fieldKey);
        }
        results[recordId as string][fv.fieldId as string] = fv.value;
      }
    }
    return results;
  },
});

/**
 * Set (upsert) a single field value for a record.
 * If a value already exists for this field+record, it is updated.
 */
export const setValue = mutation({
  args: {
    schoolId: v.id("schools"),
    recordId: v.id("records"),
    fieldId: v.id("fields"),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    await requireFieldEditAccess(ctx, args.schoolId, args.fieldId);

    // Upsert: find existing or create new
    const existing = await ctx.db
      .query("fieldValues")
      .withIndex("by_recordId_fieldId", (q) =>
        q.eq("recordId", args.recordId).eq("fieldId", args.fieldId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("fieldValues", {
        schoolId: args.schoolId,
        recordId: args.recordId,
        fieldId: args.fieldId,
        value: args.value,
      });
    }
    return existing?._id ?? "created";
  },
});

/**
 * Bulk set multiple field values for a record in one mutation.
 */
export const setValues = mutation({
  args: {
    schoolId: v.id("schools"),
    recordId: v.id("records"),
    values: v.array(
      v.object({
        fieldId: v.id("fields"),
        value: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    // Enforce edit access per field (cached)
    const accessChecked = new Set<string>();
    for (const { fieldId } of args.values) {
      const fieldKey = fieldId as string;
      if (!accessChecked.has(fieldKey)) {
        await requireFieldEditAccess(ctx, args.schoolId, fieldId);
        accessChecked.add(fieldKey);
      }
    }

    let updated = 0;
    let created = 0;
    for (const { fieldId, value } of args.values) {
      const existing = await ctx.db
        .query("fieldValues")
        .withIndex("by_recordId_fieldId", (q) =>
          q.eq("recordId", args.recordId).eq("fieldId", fieldId)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { value });
        updated++;
      } else {
        await ctx.db.insert("fieldValues", {
          schoolId: args.schoolId,
          recordId: args.recordId,
          fieldId,
          value,
        });
        created++;
      }
    }

    await logAuditEntry(ctx, args.schoolId, "fieldValues.setValues", {
      recordId: args.recordId,
      updated,
      created,
    });

    return { updated, created };
  },
});

/**
 * Delete a field value by its ID.
 */
export const remove = mutation({
  args: { id: v.id("fieldValues") },
  handler: async (ctx, args) => {
    const fv = await ctx.db.get(args.id);
    if (!fv) throw new Error("Field value not found");
    await requireSchoolMembership(ctx, fv.schoolId);
    await requireFieldEditAccess(ctx, fv.schoolId, fv.fieldId);
    await ctx.db.delete(args.id);
  },
});

import { v } from "convex/values";
import { action, internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requirePrincipal, logAuditEntry } from "./helpers";

/**
 * Bulk Operations — perform batch actions on multiple records at once.
 * Supports: status updates, field updates, and soft deletes across modules.
 */

const BULK_LIMIT = 200;
/** Each delete chunk runs as its own internal mutation transaction. */
const DELETE_CHUNK_SIZE = 100;
/** Hard ceiling for a single bulk delete call. */
const DELETE_MAX = 20000;

/** Bulk update status on any module's records */
export const bulkUpdateStatus = mutation({
  args: {
    schoolId: v.id("schools"),
    module: v.string(), // table name e.g. "students", "borrowings", "discipline_incidents"
    ids: v.array(v.string()), // document IDs as strings
    field: v.string(), // field to update
    value: v.string(), // new value
  },
  handler: async (ctx, { schoolId, module, ids, field, value }) => {
    await requirePrincipal(ctx, schoolId);

    if (ids.length === 0) throw new Error("No records selected");
    if (ids.length > BULK_LIMIT) throw new Error(`Too many records (max ${BULK_LIMIT})`);

    // Whitelist allowed tables
    const allowedTables = [
      "students", "borrowings", "discipline_incidents", "admission_applications",
      "correspondence", "appointments", "health_records", "leave_requests",
      "notification_rules", "compliance_documents", "maintenance_tasks",
    ] as const;

    if (!allowedTables.includes(module as typeof allowedTables[number])) {
      throw new Error(`Bulk update not supported for module: ${module}`);
    }

    let updated = 0;
    const errors: { id: string; reason: string }[] = [];

    for (const idStr of ids) {
      try {
        const doc = await ctx.db.get(idStr as any);
        if (!doc) {
          errors.push({ id: idStr, reason: "Record not found" });
          continue;
        }
        await ctx.db.patch(doc._id, { [field]: value } as any);
        updated++;
      } catch (err) {
        errors.push({ id: idStr, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    await logAuditEntry(ctx, schoolId, "bulk.update_status", {
      module,
      field,
      value,
      total: ids.length,
      updated,
      errors: errors.length,
    });

    return { updated, errors };
  },
});

/**
 * Bulk delete records from a module.
 *
 * Implemented as an action so large selections (e.g. "select all" on 3,000+
 * students) can be deleted in chunks — each chunk is its own internal
 * mutation transaction, staying well inside Convex's per-transaction limits.
 */
export const bulkDelete = action({
  args: {
    schoolId: v.id("schools"),
    module: v.string(),
    ids: v.array(v.string()),
  },
  handler: async (ctx, { schoolId, module, ids }) => {
    if (ids.length === 0) throw new Error("No records selected");
    if (ids.length > DELETE_MAX) {
      throw new Error(`Too many records (max ${DELETE_MAX}) — narrow your selection`);
    }

    // Allow deletion from every module that supports bulk operations — the
    // same set that can be bulk-imported/edited. Deletion is a hard delete of
    // the record itself; dependent records are not cascade-deleted.
    const deletableModules = [
      "students", "borrowings", "discipline_incidents", "admission_applications",
      "correspondence", "appointments", "clinic_visits", "counseling_notes",
      "health_records", "leave_requests", "compliance_documents",
      "maintenance_tasks", "guardian_links", "notification_rules",
    ] as const;

    if (!deletableModules.includes(module as typeof deletableModules[number])) {
      throw new Error(`Bulk delete not supported for module: ${module}`);
    }

    let deleted = 0;
    const errors: { id: string; reason: string }[] = [];

    for (let i = 0; i < ids.length; i += DELETE_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + DELETE_CHUNK_SIZE);
      const res = await ctx.runMutation(internal.bulkOperations.bulkDeleteChunk, {
        schoolId,
        module,
        ids: chunk,
      });
      deleted += res.deleted;
      errors.push(...res.errors);
    }

    await ctx.runMutation(internal.bulkOperations.bulkDeleteLog, {
      schoolId,
      module,
      total: ids.length,
      deleted,
      errors: errors.length,
    });

    return { deleted, errors };
  },
});

/** Internal per-chunk hard delete. Runs with the calling action's identity. */
export const bulkDeleteChunk = internalMutation({
  args: {
    schoolId: v.id("schools"),
    module: v.string(),
    ids: v.array(v.string()),
  },
  handler: async (ctx, { schoolId, module, ids }) => {
    await requirePrincipal(ctx, schoolId);

    let deleted = 0;
    const errors: { id: string; reason: string }[] = [];

    for (const idStr of ids) {
      try {
        const doc = await ctx.db.get(idStr as any);
        if (!doc) {
          errors.push({ id: idStr, reason: "Record not found" });
          continue;
        }
        await ctx.db.delete(doc._id);
        deleted++;
      } catch (err) {
        errors.push({ id: idStr, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    return { deleted, errors };
  },
});

/** Internal audit-log write for a completed bulk delete. */
export const bulkDeleteLog = internalMutation({
  args: {
    schoolId: v.id("schools"),
    module: v.string(),
    total: v.number(),
    deleted: v.number(),
    errors: v.number(),
  },
  handler: async (ctx, { schoolId, module, total, deleted, errors }) => {
    await requirePrincipal(ctx, schoolId);
    await logAuditEntry(ctx, schoolId, "bulk.delete", {
      module,
      total,
      deleted,
      errors,
    });
  },
});

/** Bulk update a field value on any module */
export const bulkUpdateField = mutation({
  args: {
    schoolId: v.id("schools"),
    module: v.string(),
    ids: v.array(v.string()),
    updates: v.record(v.string(), v.any()), // { fieldName: newValue }
  },
  handler: async (ctx, { schoolId, module, ids, updates }) => {
    await requirePrincipal(ctx, schoolId);

    if (ids.length === 0) throw new Error("No records selected");
    if (ids.length > BULK_LIMIT) throw new Error(`Too many records (max ${BULK_LIMIT})`);

    const allowedModules = [
      "students", "borrowings", "discipline_incidents", "admission_applications",
      "correspondence", "appointments", "health_records", "leave_requests",
    ] as const;

    if (!allowedModules.includes(module as typeof allowedModules[number])) {
      throw new Error(`Bulk update not supported for module: ${module}`);
    }

    let updated = 0;
    const errors: { id: string; reason: string }[] = [];

    for (const idStr of ids) {
      try {
        const doc = await ctx.db.get(idStr as any);
        if (!doc) {
          errors.push({ id: idStr, reason: "Record not found" });
          continue;
        }
        await ctx.db.patch(doc._id, updates as any);
        updated++;
      } catch (err) {
        errors.push({ id: idStr, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    await logAuditEntry(ctx, schoolId, "bulk.update_field", {
      module,
      fields: Object.keys(updates),
      total: ids.length,
      updated,
      errors: errors.length,
    });

    return { updated, errors };
  },
});

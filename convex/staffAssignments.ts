import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, logAuditEntry } from "./helpers";

/**
 * List all assignments for a staff record.
 */
export const listByStaff = query({
  args: { staffRecordId: v.id("records") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("staffAssignments")
      .withIndex("by_staffRecordId", (q) =>
        q.eq("staffRecordId", args.staffRecordId)
      )
      .take(100);
  },
});

/**
 * List all assignments for a school.
 */
export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("staffAssignments")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);
  },
});

/**
 * Create a new staff assignment.
 */
export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    staffRecordId: v.id("records"),
    assignmentType: v.string(),
    targetId: v.string(),
    extraPermissions: v.optional(v.any()),
    startDate: v.float64(),
    endDate: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const id = await ctx.db.insert("staffAssignments", {
      schoolId: args.schoolId,
      staffRecordId: args.staffRecordId,
      assignmentType: args.assignmentType,
      targetId: args.targetId,
      extraPermissions: args.extraPermissions,
      startDate: args.startDate,
      endDate: args.endDate,
    });
    await logAuditEntry(ctx, args.schoolId, "staffAssignment.create", {
      assignmentId: id,
      staffRecordId: args.staffRecordId,
      assignmentType: args.assignmentType,
      targetId: args.targetId,
    });
    return id;
  },
});

/**
 * Update a staff assignment (e.g. change end date, update extra permissions).
 */
export const update = mutation({
  args: {
    id: v.id("staffAssignments"),
    assignmentType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    extraPermissions: v.optional(v.any()),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.id);
    if (!assignment) throw new Error("Assignment not found");
    await requireSchoolMembership(ctx, assignment.schoolId);
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.assignmentType !== undefined) updates.assignmentType = fields.assignmentType;
    if (fields.targetId !== undefined) updates.targetId = fields.targetId;
    if (fields.extraPermissions !== undefined) updates.extraPermissions = fields.extraPermissions;
    if (fields.startDate !== undefined) updates.startDate = fields.startDate;
    if (fields.endDate !== undefined) updates.endDate = fields.endDate;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
    await logAuditEntry(ctx, assignment.schoolId, "staffAssignment.update", {
      assignmentId: id,
      updates,
    });
    return id;
  },
});

/**
 * End an assignment (set endDate to now).
 */
export const endAssignment = mutation({
  args: { id: v.id("staffAssignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.id);
    if (!assignment) throw new Error("Assignment not found");
    await requireSchoolMembership(ctx, assignment.schoolId);
    await ctx.db.patch(args.id, { endDate: Date.now() });
    await logAuditEntry(ctx, assignment.schoolId, "staffAssignment.end", {
      assignmentId: args.id,
    });
  },
});

/**
 * Remove a staff assignment.
 */
export const remove = mutation({
  args: { id: v.id("staffAssignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.id);
    if (!assignment) throw new Error("Assignment not found");
    await requireSchoolMembership(ctx, assignment.schoolId);
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, assignment.schoolId, "staffAssignment.remove", {
      assignmentId: args.id,
    });
  },
});

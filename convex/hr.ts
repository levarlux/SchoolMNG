import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireTeacherMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Leave Requests ────────────────────────────────────────────────

export const listLeaveByTeacher = query({
  args: { teacherId: v.id("teachers") },
  handler: async (ctx, args) => {
    const teacher = await requireTeacherMembership(ctx, args.teacherId);
    await requireModuleAccessByName(ctx, teacher.schoolId, "HR & Performance");
    return await ctx.db
      .query("leave_requests")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", args.teacherId))
      .order("desc")
      .take(50);
  },
});

export const listLeaveBySchool = query({
  args: {
    schoolId: v.id("schools"),
    status: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"), v.literal("cancelled"))
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    if (args.status) {
      return await ctx.db
        .query("leave_requests")
        .withIndex("by_status", (q) =>
          q.eq("schoolId", args.schoolId).eq("status", args.status!)
        )
        .order("desc")
        .take(100);
    }
    return await ctx.db
      .query("leave_requests")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const createLeaveRequest = mutation({
  args: {
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    leaveType: v.union(
      v.literal("annual"),
      v.literal("sick"),
      v.literal("maternity"),
      v.literal("paternity"),
      v.literal("compassionate"),
      v.literal("study"),
      v.literal("other"),
    ),
    startDate: v.float64(),
    endDate: v.float64(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const id = await ctx.db.insert("leave_requests", {
      ...args,
      status: "pending",
    });
    await logAuditEntry(ctx, args.schoolId, "leaveRequest.create", {
      leaveId: id,
      teacherId: args.teacherId,
      leaveType: args.leaveType,
    });
    return id;
  },
});

export const approveLeave = mutation({
  args: { id: v.id("leave_requests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Leave request not found");
    await requireModuleEditAccessByName(ctx, request.schoolId, "HR & Performance");
    const identity = await ctx.auth.getUserIdentity();
    await ctx.db.patch(args.id, {
      status: "approved",
      approvedBy: identity?.subject ?? "system",
      approvedAt: Date.now(),
    });
    await logAuditEntry(ctx, request.schoolId, "leaveRequest.approve", {
      leaveId: args.id,
    });
  },
});

export const denyLeave = mutation({
  args: { id: v.id("leave_requests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Leave request not found");
    await requireModuleEditAccessByName(ctx, request.schoolId, "HR & Performance");
    const identity = await ctx.auth.getUserIdentity();
    await ctx.db.patch(args.id, {
      status: "denied",
      approvedBy: identity?.subject ?? "system",
      approvedAt: Date.now(),
    });
  },
});

export const cancelLeave = mutation({
  args: { id: v.id("leave_requests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Leave request not found");
    await requireSchoolMembership(ctx, request.schoolId);
    if (request.status !== "pending") {
      throw new Error("Can only cancel pending requests");
    }
    await ctx.db.patch(args.id, { status: "cancelled" });
  },
});

// ── Appraisals ────────────────────────────────────────────────────

export const listAppraisalsByTeacher = query({
  args: { teacherId: v.id("teachers") },
  handler: async (ctx, args) => {
    const teacher = await requireTeacherMembership(ctx, args.teacherId);
    await requireModuleAccessByName(ctx, teacher.schoolId, "HR & Performance");
    return await ctx.db
      .query("appraisals")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", args.teacherId))
      .order("desc")
      .take(50);
  },
});

export const listAppraisalsBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("appraisals")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const createAppraisal = mutation({
  args: {
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    reviewDate: v.float64(),
    rating: v.number(),
    strengths: v.optional(v.string()),
    improvements: v.optional(v.string()),
    goals: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "HR & Performance");
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("appraisals", {
      ...args,
      reviewerId: identity?.subject ?? "system",
    });
    await logAuditEntry(ctx, args.schoolId, "appraisal.create", {
      appraisalId: id,
      teacherId: args.teacherId,
      rating: args.rating,
    });
    return id;
  },
});

export const updateAppraisal = mutation({
  args: {
    id: v.id("appraisals"),
    rating: v.optional(v.number()),
    strengths: v.optional(v.string()),
    improvements: v.optional(v.string()),
    goals: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const appraisal = await ctx.db.get(args.id);
    if (!appraisal) throw new Error("Appraisal not found");
    await requireModuleEditAccessByName(ctx, appraisal.schoolId, "HR & Performance");
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.rating !== undefined) updates.rating = fields.rating;
    if (fields.strengths !== undefined) updates.strengths = fields.strengths;
    if (fields.improvements !== undefined) updates.improvements = fields.improvements;
    if (fields.goals !== undefined) updates.goals = fields.goals;
    if (fields.notes !== undefined) updates.notes = fields.notes;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
  },
});

export const removeAppraisal = mutation({
  args: { id: v.id("appraisals") },
  handler: async (ctx, args) => {
    const appraisal = await ctx.db.get(args.id);
    if (!appraisal) throw new Error("Appraisal not found");
    await requireModuleEditAccessByName(ctx, appraisal.schoolId, "HR & Performance");
    await ctx.db.delete(args.id);
  },
});

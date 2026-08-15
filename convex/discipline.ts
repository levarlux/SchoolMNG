import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

export const listByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Discipline");
    return await ctx.db
      .query("discipline_incidents")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const listBySchool = query({
  args: {
    schoolId: v.id("schools"),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("investigating"),
        v.literal("resolved"),
        v.literal("escalated"),
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    if (args.status) {
      return await ctx.db
        .query("discipline_incidents")
        .withIndex("by_status", (q) =>
          q.eq("schoolId", args.schoolId).eq("resolutionStatus", args.status!)
        )
        .order("desc")
        .take(200);
    }
    return await ctx.db
      .query("discipline_incidents")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    description: v.string(),
    category: v.string(),
    actionTaken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("discipline_incidents", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      date: args.date,
      description: args.description,
      reportedBy: identity?.subject ?? "system",
      category: args.category,
      actionTaken: args.actionTaken,
      resolutionStatus: "open",
    });
    await logAuditEntry(ctx, args.schoolId, "discipline.create", {
      incidentId: id,
      studentId: args.studentId,
      category: args.category,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("discipline_incidents"),
    resolutionStatus: v.union(
      v.literal("open"),
      v.literal("investigating"),
      v.literal("resolved"),
      v.literal("escalated"),
    ),
    actionTaken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.id);
    if (!incident) throw new Error("Incident not found");
    await requireModuleEditAccessByName(ctx, incident.schoolId, "Discipline");
    const updates: Record<string, unknown> = {
      resolutionStatus: args.resolutionStatus,
    };
    if (args.actionTaken) updates.actionTaken = args.actionTaken;
    if (args.resolutionStatus === "resolved") {
      updates.resolvedAt = Date.now();
      const identity = await ctx.auth.getUserIdentity();
      updates.resolvedBy = identity?.subject ?? "system";
    }
    await ctx.db.patch(args.id, updates);
    await logAuditEntry(ctx, incident.schoolId, "discipline.updateStatus", {
      incidentId: args.id,
      status: args.resolutionStatus,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("discipline_incidents") },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.id);
    if (!incident) throw new Error("Incident not found");
    await requireModuleEditAccessByName(ctx, incident.schoolId, "Discipline");
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, incident.schoolId, "discipline.remove", {
      incidentId: args.id,
    });
  },
});

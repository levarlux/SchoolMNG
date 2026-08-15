import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Activities ────────────────────────────────────────────────────

export const listActivities = query({
  args: {
    schoolId: v.id("schools"),
    category: v.optional(
      v.union(
        v.literal("sports"),
        v.literal("clubs"),
        v.literal("arts"),
        v.literal("debate"),
        v.literal("community_service"),
        v.literal("other"),
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    if (args.category) {
      return await ctx.db
        .query("extracurricular_activities")
        .withIndex("by_category", (q) =>
          q.eq("schoolId", args.schoolId).eq("category", args.category!)
        )
        .take(100);
    }
    return await ctx.db
      .query("extracurricular_activities")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(100);
  },
});

export const createActivity = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.union(
      v.literal("sports"),
      v.literal("clubs"),
      v.literal("arts"),
      v.literal("debate"),
      v.literal("community_service"),
      v.literal("other"),
    ),
    schedule: v.optional(v.string()),
    venue: v.optional(v.string()),
    coordinatorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Extracurricular");
    const id = await ctx.db.insert("extracurricular_activities", {
      schoolId: args.schoolId,
      name: args.name,
      description: args.description,
      category: args.category,
      schedule: args.schedule,
      venue: args.venue,
      coordinatorId: args.coordinatorId,
    });
    await logAuditEntry(ctx, args.schoolId, "activity.create", {
      activityId: id,
      name: args.name,
    });
    return id;
  },
});

export const updateActivity = mutation({
  args: {
    id: v.id("extracurricular_activities"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    schedule: v.optional(v.string()),
    venue: v.optional(v.string()),
    coordinatorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const activity = await ctx.db.get(args.id);
    if (!activity) throw new Error("Activity not found");
    await requireModuleEditAccessByName(ctx, activity.schoolId, "Extracurricular");
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.name !== undefined) updates.name = fields.name;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.schedule !== undefined) updates.schedule = fields.schedule;
    if (fields.venue !== undefined) updates.venue = fields.venue;
    if (fields.coordinatorId !== undefined) updates.coordinatorId = fields.coordinatorId;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
  },
});

export const removeActivity = mutation({
  args: { id: v.id("extracurricular_activities") },
  handler: async (ctx, args) => {
    const activity = await ctx.db.get(args.id);
    if (!activity) throw new Error("Activity not found");
    await requireModuleEditAccessByName(ctx, activity.schoolId, "Extracurricular");
    // Remove all student participations
    const participations = await ctx.db
      .query("student_activities")
      .withIndex("by_activityId", (q) => q.eq("activityId", args.id))
      .take(100);
    for (const p of participations) {
      await ctx.db.delete(p._id);
    }
    await ctx.db.delete(args.id);
  },
});

// ── Student Participation ─────────────────────────────────────────

export const listStudentsByActivity = query({
  args: { activityId: v.id("extracurricular_activities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("student_activities")
      .withIndex("by_activityId", (q) => q.eq("activityId", args.activityId))
      .take(200);
  },
});

export const listActivitiesByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Extracurricular");
    return await ctx.db
      .query("student_activities")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .take(50);
  },
});

export const enrollStudent = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    activityId: v.id("extracurricular_activities"),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    // Check for duplicate
    const existing = await ctx.db
      .query("student_activities")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .filter((q) => q.eq(q.field("activityId"), args.activityId))
      .first();
    if (existing) throw new Error("Student already enrolled in this activity");
    const id = await ctx.db.insert("student_activities", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      activityId: args.activityId,
      role: args.role,
      joinedAt: Date.now(),
      status: "active",
    });
    await logAuditEntry(ctx, args.schoolId, "activity.enroll", {
      participationId: id,
      studentId: args.studentId,
      activityId: args.activityId,
    });
    return id;
  },
});

export const unenrollStudent = mutation({
  args: { id: v.id("student_activities") },
  handler: async (ctx, args) => {
    const participation = await ctx.db.get(args.id);
    if (!participation) throw new Error("Participation not found");
    await requireSchoolMembership(ctx, participation.schoolId);
    await ctx.db.patch(args.id, { status: "inactive" });
  },
});

export const removeParticipation = mutation({
  args: { id: v.id("student_activities") },
  handler: async (ctx, args) => {
    const participation = await ctx.db.get(args.id);
    if (!participation) throw new Error("Participation not found");
    await requireSchoolMembership(ctx, participation.schoolId);
    await ctx.db.delete(args.id);
  },
});

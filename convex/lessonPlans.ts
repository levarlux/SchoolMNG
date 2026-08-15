import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requirePrincipal, logAuditEntry } from "./helpers";

// ── Schemes of Work ───────────────────────────────────────────────

export const listSchemesByTeacher = query({
  args: { teacherId: v.id("teachers"), termId: v.id("terms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("schemes_of_work")
      .withIndex("by_teacherId_termId", (q) =>
        q.eq("teacherId", args.teacherId).eq("termId", args.termId)
      )
      .order("asc")
      .take(100);
  },
});

export const listSchemesBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("schemes_of_work")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const createScheme = mutation({
  args: {
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    subjectId: v.id("subjects"),
    classId: v.id("classes"),
    termId: v.id("terms"),
    weekNumber: v.number(),
    topic: v.string(),
    objectives: v.array(v.string()),
    resources: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const id = await ctx.db.insert("schemes_of_work", {
      ...args,
      status: "draft",
    });
    await logAuditEntry(ctx, args.schoolId, "scheme.create", {
      schemeId: id,
      topic: args.topic,
    });
    return id;
  },
});

export const updateScheme = mutation({
  args: {
    id: v.id("schemes_of_work"),
    topic: v.optional(v.string()),
    objectives: v.optional(v.array(v.string())),
    resources: v.optional(v.array(v.string())),
    status: v.optional(v.union(v.literal("draft"), v.literal("approved"), v.literal("taught"))),
  },
  handler: async (ctx, args) => {
    const scheme = await ctx.db.get(args.id);
    if (!scheme) throw new Error("Scheme not found");
    await requireSchoolMembership(ctx, scheme.schoolId);
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.topic !== undefined) updates.topic = fields.topic;
    if (fields.objectives !== undefined) updates.objectives = fields.objectives;
    if (fields.resources !== undefined) updates.resources = fields.resources;
    if (fields.status !== undefined) updates.status = fields.status;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
  },
});

export const removeScheme = mutation({
  args: { id: v.id("schemes_of_work") },
  handler: async (ctx, args) => {
    const scheme = await ctx.db.get(args.id);
    if (!scheme) throw new Error("Scheme not found");
    await requireSchoolMembership(ctx, scheme.schoolId);
    // Remove linked lesson plans
    const plans = await ctx.db
      .query("lesson_plans")
      .withIndex("by_schemeId", (q) => q.eq("schemeId", args.id))
      .take(100);
    for (const p of plans) {
      await ctx.db.delete(p._id);
    }
    await ctx.db.delete(args.id);
  },
});

// ── Lesson Plans ──────────────────────────────────────────────────

export const listPlansByScheme = query({
  args: { schemeId: v.id("schemes_of_work") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("lesson_plans")
      .withIndex("by_schemeId", (q) => q.eq("schemeId", args.schemeId))
      .order("asc")
      .take(100);
  },
});

export const listPlansByTeacher = query({
  args: { teacherId: v.id("teachers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("lesson_plans")
      .withIndex("by_teacherId_date", (q) => q.eq("teacherId", args.teacherId))
      .order("desc")
      .take(100);
  },
});

export const createPlan = mutation({
  args: {
    schoolId: v.id("schools"),
    schemeId: v.id("schemes_of_work"),
    teacherId: v.id("teachers"),
    date: v.float64(),
    objectives: v.array(v.string()),
    activities: v.string(),
    assessment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const id = await ctx.db.insert("lesson_plans", {
      ...args,
      status: "draft",
    });
    return id;
  },
});

export const updatePlan = mutation({
  args: {
    id: v.id("lesson_plans"),
    objectives: v.optional(v.array(v.string())),
    activities: v.optional(v.string()),
    assessment: v.optional(v.string()),
    reflection: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("taught"), v.literal("reviewed"))),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.id);
    if (!plan) throw new Error("Lesson plan not found");
    await requireSchoolMembership(ctx, plan.schoolId);
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.objectives !== undefined) updates.objectives = fields.objectives;
    if (fields.activities !== undefined) updates.activities = fields.activities;
    if (fields.assessment !== undefined) updates.assessment = fields.assessment;
    if (fields.reflection !== undefined) updates.reflection = fields.reflection;
    if (fields.status !== undefined) updates.status = fields.status;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
  },
});

export const removePlan = mutation({
  args: { id: v.id("lesson_plans") },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.id);
    if (!plan) throw new Error("Lesson plan not found");
    await requireSchoolMembership(ctx, plan.schoolId);
    await ctx.db.delete(args.id);
  },
});

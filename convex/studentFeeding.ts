/**
 * Student Feeding (Phase 3)
 * 
 * CRUD operations for:
 * - Feeding Plans
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Feeding Plans ──────────────────────────────────────────────────

export const listFeedingPlans = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("feeding_plans")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(50);
  },
});

export const createFeedingPlan = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    planType: v.union(v.literal("full_board"), v.literal("day_scholar"), v.literal("special_diet")),
    dietaryRestriction: v.optional(v.string()),
    startDate: v.float64(),
    endDate: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Feeding");
    
    // Deactivate any existing active plan
    const existing = await ctx.db
      .query("feeding_plans")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .take(10);
    for (const plan of existing) {
      if (plan.isActive) {
        await ctx.db.patch(plan._id, { isActive: false });
      }
    }
    
    const id = await ctx.db.insert("feeding_plans", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      planType: args.planType,
      dietaryRestriction: args.dietaryRestriction,
      startDate: args.startDate,
      endDate: args.endDate,
      isActive: true,
    });
    await logAuditEntry(ctx, args.schoolId, "feedingPlan.create", { planId: id, studentId: args.studentId });
    return id;
  },
});

export const deactivateFeedingPlan = mutation({
  args: { id: v.id("feeding_plans") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Feeding plan not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Feeding");
    await ctx.db.patch(args.id, { isActive: false });
  },
});

// ── School-wide Queries ────────────────────────────────────────────

export const listFeedingPlansBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("feeding_plans")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(500);
  },
});

export const getFeedingStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const plans = await ctx.db
      .query("feeding_plans")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);
    
    const activePlans = plans.filter(p => p.isActive);
    
    return {
      total: activePlans.length,
      fullBoard: activePlans.filter(p => p.planType === "full_board").length,
      dayScholar: activePlans.filter(p => p.planType === "day_scholar").length,
      specialDiet: activePlans.filter(p => p.planType === "special_diet").length,
    };
  },
});

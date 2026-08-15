/**
 * Student Finance (Phase 3)
 * 
 * CRUD operations for:
 * - Scholarships/Bursaries
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Scholarships ───────────────────────────────────────────────────

export const listScholarships = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Finance");
    return await ctx.db
      .query("scholarships")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(50);
  },
});

export const createScholarship = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    sponsorName: v.string(),
    sponsorshipType: v.union(
      v.literal("full"), v.literal("partial"), v.literal("merit"), v.literal("need_based"),
    ),
    coverageAmount: v.optional(v.number()),
    coveragePercentage: v.optional(v.number()),
    renewalStatus: v.union(v.literal("active"), v.literal("pending"), v.literal("expired")),
    conditions: v.optional(v.string()),
    startDate: v.float64(),
    endDate: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Finance");
    const id = await ctx.db.insert("scholarships", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      sponsorName: args.sponsorName,
      sponsorshipType: args.sponsorshipType,
      coverageAmount: args.coverageAmount,
      coveragePercentage: args.coveragePercentage,
      renewalStatus: args.renewalStatus,
      conditions: args.conditions,
      startDate: args.startDate,
      endDate: args.endDate,
    });
    await logAuditEntry(ctx, args.schoolId, "scholarship.create", { scholarshipId: id, studentId: args.studentId });
    return id;
  },
});

export const updateScholarship = mutation({
  args: {
    id: v.id("scholarships"),
    renewalStatus: v.optional(v.union(v.literal("active"), v.literal("pending"), v.literal("expired"))),
    endDate: v.optional(v.float64()),
    conditions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Scholarship not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Finance");
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

export const removeScholarship = mutation({
  args: { id: v.id("scholarships") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Scholarship not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Finance");
    await ctx.db.delete(args.id);
  },
});

// ── School-wide Queries ────────────────────────────────────────────

export const listScholarshipsBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("scholarships")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const getScholarshipStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const scholarships = await ctx.db
      .query("scholarships")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);
    
    return {
      total: scholarships.length,
      active: scholarships.filter(s => s.renewalStatus === "active").length,
      pending: scholarships.filter(s => s.renewalStatus === "pending").length,
      expired: scholarships.filter(s => s.renewalStatus === "expired").length,
      byType: {
        full: scholarships.filter(s => s.sponsorshipType === "full").length,
        partial: scholarships.filter(s => s.sponsorshipType === "partial").length,
        merit: scholarships.filter(s => s.sponsorshipType === "merit").length,
        need_based: scholarships.filter(s => s.sponsorshipType === "need_based").length,
      },
    };
  },
});

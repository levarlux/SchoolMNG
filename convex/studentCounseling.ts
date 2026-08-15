/**
 * Student Counseling (Phase 3)
 * 
 * CRUD operations for:
 * - Counseling Sessions
 * - Counseling Referrals
 * - Counseling Follow-ups
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Counseling Sessions ────────────────────────────────────────────

export const listCounselingSessions = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_counseling_sessions")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createCounselingSession = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    sessionDate: v.float64(),
    counselorName: v.string(),
    sessionType: v.union(v.literal("individual"), v.literal("group"), v.literal("crisis"), v.literal("family")),
    presentingConcern: v.string(),
    sessionNotes: v.string(),
    riskLevel: v.union(v.literal("none"), v.literal("low"), v.literal("moderate"), v.literal("high")),
    safetyPlanOnFile: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const id = await ctx.db.insert("student_counseling_sessions", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      sessionDate: args.sessionDate,
      counselorName: args.counselorName,
      sessionType: args.sessionType,
      presentingConcern: args.presentingConcern,
      sessionNotes: args.sessionNotes,
      riskLevel: args.riskLevel,
      safetyPlanOnFile: args.safetyPlanOnFile,
    });
    await logAuditEntry(ctx, args.schoolId, "counselingSession.create", { sessionId: id, studentId: args.studentId, riskLevel: args.riskLevel });
    return id;
  },
});

export const updateCounselingSession = mutation({
  args: {
    id: v.id("student_counseling_sessions"),
    sessionNotes: v.optional(v.string()),
    riskLevel: v.optional(v.union(v.literal("none"), v.literal("low"), v.literal("moderate"), v.literal("high"))),
    safetyPlanOnFile: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Session not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

export const removeCounselingSession = mutation({
  args: { id: v.id("student_counseling_sessions") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Session not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    // Also remove associated referrals and follow-ups
    const referrals = await ctx.db
      .query("student_counseling_referrals")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.id))
      .take(50);
    for (const ref of referrals) {
      await ctx.db.delete(ref._id);
    }
    const followups = await ctx.db
      .query("student_counseling_followup")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.id))
      .take(50);
    for (const fu of followups) {
      await ctx.db.delete(fu._id);
    }
    await ctx.db.delete(args.id);
  },
});

// ── Counseling Referrals ───────────────────────────────────────────

export const listCounselingReferrals = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_counseling_referrals")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createCounselingReferral = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    sessionId: v.id("student_counseling_sessions"),
    externalReferralMade: v.boolean(),
    referredTo: v.optional(v.string()),
    reason: v.optional(v.string()),
    parentInformed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const id = await ctx.db.insert("student_counseling_referrals", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      sessionId: args.sessionId,
      externalReferralMade: args.externalReferralMade,
      referredTo: args.referredTo,
      reason: args.reason,
      parentInformed: args.parentInformed,
    });
    await logAuditEntry(ctx, args.schoolId, "counselingReferral.create", { referralId: id, studentId: args.studentId });
    return id;
  },
});

// ── Counseling Follow-ups ──────────────────────────────────────────

export const listCounselingFollowups = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_counseling_followup")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createCounselingFollowup = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    sessionId: v.id("student_counseling_sessions"),
    planDescription: v.string(),
    reviewDate: v.float64(),
    responsibleStaff: v.string(),
    status: v.union(v.literal("active"), v.literal("closed"), v.literal("escalated")),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const id = await ctx.db.insert("student_counseling_followup", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      sessionId: args.sessionId,
      planDescription: args.planDescription,
      reviewDate: args.reviewDate,
      responsibleStaff: args.responsibleStaff,
      status: args.status,
    });
    await logAuditEntry(ctx, args.schoolId, "counselingFollowup.create", { followupId: id, studentId: args.studentId });
    return id;
  },
});

export const updateCounselingFollowup = mutation({
  args: {
    id: v.id("student_counseling_followup"),
    status: v.union(v.literal("active"), v.literal("closed"), v.literal("escalated")),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Follow-up not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    await ctx.db.patch(args.id, { status: args.status });
  },
});

// ── School-wide Queries ────────────────────────────────────────────

export const listCounselingSessionsBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("student_counseling_sessions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const listHighRiskStudents = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    // Get all sessions with high or moderate risk
    const sessions = await ctx.db
      .query("student_counseling_sessions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
    
    // Filter for high/moderate risk and deduplicate by student
    const riskMap = new Map<string, { studentId: string; riskLevel: string; sessionDate: number; counselorName: string }>();
    for (const session of sessions) {
      if (session.riskLevel === "high" || session.riskLevel === "moderate") {
        const existing = riskMap.get(session.studentId);
        if (!existing || session.sessionDate > existing.sessionDate) {
          riskMap.set(session.studentId, {
            studentId: session.studentId,
            riskLevel: session.riskLevel,
            sessionDate: session.sessionDate,
            counselorName: session.counselorName,
          });
        }
      }
    }
    return Array.from(riskMap.values());
  },
});

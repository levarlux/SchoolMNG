/**
 * Student Reports (Phase 3)
 * 
 * CRUD operations for:
 * - Report Cards
 * - Academic History
 * - Learning Support
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Report Cards ───────────────────────────────────────────────────

export const listReportCards = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireStudentMembership(ctx, args.studentId);
    return await ctx.db
      .query("student_report_cards")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(50);
  },
});

export const createReportCard = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    termId: v.id("terms"),
    teacherComment: v.optional(v.string()),
    headteacherComment: v.optional(v.string()),
    attendanceSummary: v.optional(v.string()),
    promotionRecommendation: v.union(
      v.literal("promote"), v.literal("repeat"), v.literal("under_review"),
    ),
    parentAcknowledged: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Academics");
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("student_report_cards", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      termId: args.termId,
      teacherComment: args.teacherComment,
      headteacherComment: args.headteacherComment,
      attendanceSummary: args.attendanceSummary,
      promotionRecommendation: args.promotionRecommendation,
      parentAcknowledged: args.parentAcknowledged,
      generatedAt: Date.now(),
      generatedBy: identity?.subject ?? "system",
    });
    await logAuditEntry(ctx, args.schoolId, "reportCard.create", { reportCardId: id, studentId: args.studentId });
    return id;
  },
});

export const updateReportCard = mutation({
  args: {
    id: v.id("student_report_cards"),
    teacherComment: v.optional(v.string()),
    headteacherComment: v.optional(v.string()),
    promotionRecommendation: v.optional(v.union(
      v.literal("promote"), v.literal("repeat"), v.literal("under_review"),
    )),
    parentAcknowledged: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Report card not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Academics");
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

// ── Academic History ───────────────────────────────────────────────

export const listAcademicHistory = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireStudentMembership(ctx, args.studentId);
    return await ctx.db
      .query("student_academic_history")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(50);
  },
});

export const createAcademicHistory = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    academicYear: v.string(),
    fromClassId: v.id("classes"),
    toClassId: v.id("classes"),
    outcome: v.union(v.literal("promoted"), v.literal("repeated"), v.literal("transferred")),
    decisionBasis: v.union(v.literal("automatic"), v.literal("exam_based"), v.literal("committee")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Academics");
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("student_academic_history", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      academicYear: args.academicYear,
      fromClassId: args.fromClassId,
      toClassId: args.toClassId,
      outcome: args.outcome,
      date: Date.now(),
      decisionBasis: args.decisionBasis,
      notes: args.notes,
    });
    await logAuditEntry(ctx, args.schoolId, "academicHistory.create", { historyId: id, studentId: args.studentId });
    return id;
  },
});

// ── Learning Support ───────────────────────────────────────────────

export const getLearningSupport = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireStudentMembership(ctx, args.studentId);
    return await ctx.db
      .query("student_learning_support")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .first();
  },
});

export const upsertLearningSupport = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    specialNeedsFlag: v.boolean(),
    iepNotes: v.optional(v.string()),
    learningSupportSessions: v.optional(v.number()),
    remedialClassEnrolled: v.optional(v.boolean()),
    giftedProgramEnrolled: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Academics");
    const existing = await ctx.db
      .query("student_learning_support")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        specialNeedsFlag: args.specialNeedsFlag,
        iepNotes: args.iepNotes,
        learningSupportSessions: args.learningSupportSessions,
        remedialClassEnrolled: args.remedialClassEnrolled,
        giftedProgramEnrolled: args.giftedProgramEnrolled,
        notes: args.notes,
      });
      return existing._id;
    }
    return await ctx.db.insert("student_learning_support", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      specialNeedsFlag: args.specialNeedsFlag,
      iepNotes: args.iepNotes,
      learningSupportSessions: args.learningSupportSessions,
      remedialClassEnrolled: args.remedialClassEnrolled,
      giftedProgramEnrolled: args.giftedProgramEnrolled,
      notes: args.notes,
    });
  },
});

// ── School-wide Queries ────────────────────────────────────────────

export const listReportCardsBySchool = query({
  args: { schoolId: v.id("schools"), termId: v.optional(v.id("terms")) },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    if (args.termId) {
      return await ctx.db
        .query("student_report_cards")
        .withIndex("by_termId", (q) => q.eq("termId", args.termId!))
        .order("desc")
        .take(200);
    }
    return await ctx.db
      .query("student_report_cards")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const listSpecialNeedsStudents = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const allSupport = await ctx.db
      .query("student_learning_support")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);
    
    return allSupport.filter(s => s.specialNeedsFlag);
  },
});

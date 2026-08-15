/**
 * Student Screenings & Growth Monitoring (Phase 3)
 * 
 * CRUD operations for:
 * - Vision Screenings
 * - Hearing Screenings
 * - Dental Checkups
 * - Growth Tracking (height/weight/BMI)
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Vision Screenings ──────────────────────────────────────────────

export const listVisionScreenings = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_vision_screenings")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createVisionScreening = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    screeningDate: v.float64(),
    screenedBy: v.string(),
    result: v.union(v.literal("normal"), v.literal("referral"), v.literal("re_test")),
    leftEyeAcuity: v.optional(v.string()),
    rightEyeAcuity: v.optional(v.string()),
    correctiveLenses: v.optional(v.boolean()),
    referralIssued: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const id = await ctx.db.insert("student_vision_screenings", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      screeningDate: args.screeningDate,
      screenedBy: args.screenedBy,
      result: args.result,
      leftEyeAcuity: args.leftEyeAcuity,
      rightEyeAcuity: args.rightEyeAcuity,
      correctiveLenses: args.correctiveLenses,
      referralIssued: args.referralIssued,
    });
    await logAuditEntry(ctx, args.schoolId, "visionScreening.create", { screeningId: id, studentId: args.studentId });
    return id;
  },
});

// ── Hearing Screenings ─────────────────────────────────────────────

export const listHearingScreenings = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_hearing_screenings")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createHearingScreening = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    screeningDate: v.float64(),
    screenedBy: v.string(),
    leftEarResult: v.union(v.literal("normal"), v.literal("referral"), v.literal("re_test")),
    rightEarResult: v.union(v.literal("normal"), v.literal("referral"), v.literal("re_test")),
    referralIssued: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const id = await ctx.db.insert("student_hearing_screenings", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      screeningDate: args.screeningDate,
      screenedBy: args.screenedBy,
      leftEarResult: args.leftEarResult,
      rightEarResult: args.rightEarResult,
      referralIssued: args.referralIssued,
    });
    await logAuditEntry(ctx, args.schoolId, "hearingScreening.create", { screeningId: id, studentId: args.studentId });
    return id;
  },
});

// ── Dental Checkups ────────────────────────────────────────────────

export const listDentalCheckups = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_dental_checkups")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createDentalCheckup = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    checkupDate: v.float64(),
    dentistClinic: v.string(),
    findings: v.optional(v.string()),
    treatmentRecommended: v.optional(v.string()),
    treatmentCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const id = await ctx.db.insert("student_dental_checkups", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      checkupDate: args.checkupDate,
      dentistClinic: args.dentistClinic,
      findings: args.findings,
      treatmentRecommended: args.treatmentRecommended,
      treatmentCompleted: args.treatmentCompleted,
    });
    await logAuditEntry(ctx, args.schoolId, "dentalCheckup.create", { checkupId: id, studentId: args.studentId });
    return id;
  },
});

// ── Growth Tracking ────────────────────────────────────────────────

export const listGrowthLogs = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_growth_logs")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createGrowthLog = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    height: v.number(),
    weight: v.number(),
    nurseNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    // Auto-calculate BMI (weight in kg / height in m²)
    const heightInMeters = args.height / 100;
    const bmi = Math.round((args.weight / (heightInMeters * heightInMeters)) * 10) / 10;
    
    const id = await ctx.db.insert("student_growth_logs", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      date: args.date,
      height: args.height,
      weight: args.weight,
      bmi,
      nurseNotes: args.nurseNotes,
    });
    await logAuditEntry(ctx, args.schoolId, "growthLog.create", { logId: id, studentId: args.studentId, bmi });
    return id;
  },
});

// ── School-wide Screenings ─────────────────────────────────────────

export const listVisionScreeningsBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("student_vision_screenings")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const listHearingScreeningsBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("student_hearing_screenings")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const listDentalCheckupsBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("student_dental_checkups")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const listGrowthLogsBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("student_growth_logs")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

/**
 * Student Attendance (Phase 3)
 * 
 * CRUD operations for:
 * - Period-level Attendance
 * - Absence Logs
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Period Attendance ──────────────────────────────────────────────

export const listPeriodAttendance = query({
  args: { studentId: v.id("students"), date: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    await requireStudentMembership(ctx, args.studentId);
    if (args.date) {
      return await ctx.db
        .query("period_attendance")
        .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
        .order("desc")
        .take(100);
    }
    return await ctx.db
      .query("period_attendance")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createPeriodAttendance = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    classId: v.id("classes"),
    date: v.float64(),
    periodNumber: v.number(),
    subjectId: v.optional(v.id("subjects")),
    teacherId: v.optional(v.id("teachers")),
    status: v.union(v.literal("present"), v.literal("absent"), v.literal("late")),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Attendance");
    const id = await ctx.db.insert("period_attendance", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      classId: args.classId,
      date: args.date,
      periodNumber: args.periodNumber,
      subjectId: args.subjectId,
      teacherId: args.teacherId,
      status: args.status,
    });
    return id;
  },
});

export const bulkCreatePeriodAttendance = mutation({
  args: {
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    date: v.float64(),
    periodNumber: v.number(),
    records: v.array(v.object({
      studentId: v.id("students"),
      status: v.union(v.literal("present"), v.literal("absent"), v.literal("late")),
    })),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Attendance");
    let created = 0;
    for (const record of args.records) {
      await ctx.db.insert("period_attendance", {
        schoolId: args.schoolId,
        studentId: record.studentId,
        classId: args.classId,
        date: args.date,
        periodNumber: args.periodNumber,
        status: record.status,
      });
      created++;
    }
    return { created };
  },
});

// ── Absence Logs ───────────────────────────────────────────────────

export const listAbsenceLogs = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireStudentMembership(ctx, args.studentId);
    return await ctx.db
      .query("absence_logs")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createAbsenceLog = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    absenceReason: v.union(
      v.literal("sick"), v.literal("family"), v.literal("transport"),
      v.literal("unexcused"), v.literal("other"),
    ),
    excused: v.boolean(),
    parentNotified: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Attendance");
    const id = await ctx.db.insert("absence_logs", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      date: args.date,
      absenceReason: args.absenceReason,
      excused: args.excused,
      parentNotified: args.parentNotified,
      parentNotifiedAt: args.parentNotified ? Date.now() : undefined,
      notes: args.notes,
    });
    await logAuditEntry(ctx, args.schoolId, "absenceLog.create", { absenceId: id, studentId: args.studentId });
    return id;
  },
});

export const updateAbsenceLog = mutation({
  args: {
    id: v.id("absence_logs"),
    excused: v.optional(v.boolean()),
    parentNotified: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Absence log not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Attendance");
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

// ── School-wide Queries ────────────────────────────────────────────

export const listAbsenceLogsBySchool = query({
  args: { schoolId: v.id("schools"), date: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    if (args.date) {
      return await ctx.db
        .query("absence_logs")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
        .order("desc")
        .take(200);
    }
    return await ctx.db
      .query("absence_logs")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const getAbsenceStats = query({
  args: { schoolId: v.id("schools"), studentId: v.optional(v.id("students")) },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    
    let absences;
    if (args.studentId) {
      absences = await ctx.db
        .query("absence_logs")
        .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId!))
        .take(500);
    } else {
      absences = await ctx.db
        .query("absence_logs")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
        .take(500);
    }
    
    return {
      total: absences.length,
      excused: absences.filter(a => a.excused).length,
      unexcused: absences.filter(a => !a.excused).length,
      byReason: {
        sick: absences.filter(a => a.absenceReason === "sick").length,
        family: absences.filter(a => a.absenceReason === "family").length,
        transport: absences.filter(a => a.absenceReason === "transport").length,
        unexcused: absences.filter(a => a.absenceReason === "unexcused").length,
        other: absences.filter(a => a.absenceReason === "other").length,
      },
    };
  },
});

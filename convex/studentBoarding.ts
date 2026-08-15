/**
 * Student Boarding (Phase 3)
 * 
 * CRUD operations for:
 * - Boarding Records (dorm/room/bed)
 * - Boarding Welfare Checks
 * - Boarding Leave Requests
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Boarding Records ───────────────────────────────────────────────

export const listBoardingRecords = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Boarding");
    return await ctx.db
      .query("boarding_records")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(50);
  },
});

export const createBoardingRecord = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    dormName: v.string(),
    roomNumber: v.string(),
    bedNumber: v.optional(v.string()),
    matronPatronAssigned: v.optional(v.string()),
    academicYearId: v.id("academicYears"),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Boarding");
    
    // Deactivate any existing boarding record for this student
    const existing = await ctx.db
      .query("boarding_records")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(10);
    for (const record of existing) {
      if (record.isActive) {
        await ctx.db.patch(record._id, { isActive: false });
      }
    }
    
    const id = await ctx.db.insert("boarding_records", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      dormName: args.dormName,
      roomNumber: args.roomNumber,
      bedNumber: args.bedNumber,
      matronPatronAssigned: args.matronPatronAssigned,
      academicYearId: args.academicYearId,
      isActive: true,
    });
    await logAuditEntry(ctx, args.schoolId, "boardingRecord.create", { boardingId: id, studentId: args.studentId });
    return id;
  },
});

export const deactivateBoardingRecord = mutation({
  args: { id: v.id("boarding_records") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Boarding record not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Boarding");
    await ctx.db.patch(args.id, { isActive: false });
  },
});

// ── Boarding Welfare Checks ────────────────────────────────────────

export const listWelfareChecks = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Boarding");
    return await ctx.db
      .query("boarding_welfare_checks")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createWelfareCheck = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    checkDate: v.float64(),
    checkedBy: v.string(),
    welfareStatus: v.string(),
    concernsFlagged: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Boarding");
    const id = await ctx.db.insert("boarding_welfare_checks", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      checkDate: args.checkDate,
      checkedBy: args.checkedBy,
      welfareStatus: args.welfareStatus,
      concernsFlagged: args.concernsFlagged,
    });
    await logAuditEntry(ctx, args.schoolId, "welfareCheck.create", { checkId: id, studentId: args.studentId });
    return id;
  },
});

// ── Boarding Leave Requests ────────────────────────────────────────

export const listLeaveRequests = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Boarding");
    return await ctx.db
      .query("boarding_leave_requests")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createLeaveRequest = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    reason: v.string(),
    destination: v.string(),
    pickupPerson: v.string(),
    expectedReturnDate: v.float64(),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Boarding");
    const id = await ctx.db.insert("boarding_leave_requests", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      requestDate: Date.now(),
      reason: args.reason,
      destination: args.destination,
      pickupPerson: args.pickupPerson,
      expectedReturnDate: args.expectedReturnDate,
      status: "pending",
    });
    await logAuditEntry(ctx, args.schoolId, "leaveRequest.create", { leaveId: id, studentId: args.studentId });
    return id;
  },
});

export const updateLeaveRequest = mutation({
  args: {
    id: v.id("boarding_leave_requests"),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"), v.literal("returned")),
    approvedBy: v.optional(v.string()),
    actualReturnDate: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Leave request not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Boarding");
    await ctx.db.patch(args.id, {
      status: args.status,
      approvedBy: args.approvedBy,
      actualReturnDate: args.actualReturnDate,
    });
  },
});

// ── School-wide Queries ────────────────────────────────────────────

export const listBoardingRecordsBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("boarding_records")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(500);
  },
});

/**
 * Phase 18: the students table no longer carries isBoarding / dormName /
 * roomNumber / bedNumber — boarding lives in boarding_records (a join keyed by
 * studentId). This query returns every student with their ACTIVE boarding
 * record (if any), so boarding & feeding pages derive their lists from one
 * tenant-scoped source of truth instead of stripped columns.
 */
export const listBySchoolWithBoarding = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const [students, records] = await Promise.all([
      ctx.db
        .query("students")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
        .take(1000),
      ctx.db
        .query("boarding_records")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
        .take(1000),
    ]);

    const activeByStudent = new Map<string, Doc<"boarding_records">>();
    for (const r of records) {
      if (!r.isActive) continue;
      if (!activeByStudent.has(r.studentId)) activeByStudent.set(r.studentId, r);
    }

    return students.map((s) => {
      const b = activeByStudent.get(s._id);
      return {
        student: s,
        isBoarding: !!b,
        dormName: b?.dormName ?? undefined,
        roomNumber: b?.roomNumber ?? undefined,
        bedNumber: b?.bedNumber ?? undefined,
        matronPatronAssigned: b?.matronPatronAssigned ?? undefined,
        academicYearId: b?.academicYearId ?? undefined,
      };
    });
  },
});

export const listLeaveRequestsBySchool = query({
  args: { schoolId: v.id("schools"), status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"), v.literal("returned"))) },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const all = await ctx.db
      .query("boarding_leave_requests")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
    if (args.status) {
      return all.filter(r => r.status === args.status);
    }
    return all;
  },
});

export const getBoardingStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const records = await ctx.db
      .query("boarding_records")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);
    
    const activeRecords = records.filter(r => r.isActive);
    
    // Group by dorm
    const byDorm: Record<string, number> = {};
    for (const r of activeRecords) {
      byDorm[r.dormName] = (byDorm[r.dormName] || 0) + 1;
    }
    
    return {
      totalBoarding: activeRecords.length,
      byDorm,
    };
  },
});

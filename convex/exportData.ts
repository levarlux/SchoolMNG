import { v } from "convex/values";
import { query } from "./_generated/server";
import { requirePrincipal } from "./helpers";
import { loadStudentEavValues } from "./studentEavLookup";

/**
 * Export Data — query module data for CSV export.
 * Returns structured data that the frontend converts to CSV.
 */

/** Export students as CSV-ready data */
export const students = query({
  args: {
    schoolId: v.id("schools"),
  },
  handler: async (ctx, { schoolId }) => {
    await requirePrincipal(ctx, schoolId);

    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(2000);

    // Resolve class names
    const classIds = [...new Set(students.map((s) => s.classId))];
    const classes = await Promise.all(classIds.map((id) => ctx.db.get(id)));
    const classMap = new Map(classes.filter(Boolean).map((c) => [c!._id, c!.name]));

    const streamIds = [...new Set(students.filter((s) => s.streamId).map((s) => s.streamId!))];
    const streams = await Promise.all(streamIds.map((id) => ctx.db.get(id)));
    const streamMap = new Map(streams.filter(Boolean).map((s) => [s!._id, s!.name]));

    // Phase 18: Gender / DOB / Admission Date / guardian & contact come from
    // the school's own EAV fields (joined by school-defined alias).
    const eav = await loadStudentEavValues(ctx, schoolId, [
      "gender",
      "dateOfBirth",
      "admissionDate",
      "guardianName",
      "guardianPhone",
      "guardianEmail",
      "homeAddress",
    ]);

    return students.map((s) => {
      const v = eav.get(s._id) ?? {};
      return {
        "First Name": s.firstName,
        "Last Name": s.lastName,
        "Admission No": s.admNo,
        Class: classMap.get(s.classId) ?? "",
        Stream: s.streamId ? (streamMap.get(s.streamId) ?? "") : "",
        Gender: v.gender ?? "",
        "Date of Birth": v.dateOfBirth ? new Date(Number(v.dateOfBirth)).toISOString().slice(0, 10) : "",
        "Admission Date": v.admissionDate ? new Date(Number(v.admissionDate)).toISOString().slice(0, 10) : "",
        Status: s.status ?? "",
        "Guardian Name": v.guardianName ?? "",
        "Guardian Phone": v.guardianPhone ?? "",
        "Guardian Email": v.guardianEmail ?? "",
        "Home Address": v.homeAddress ?? "",
      };
    });
  },
});

/** Export exam results as CSV-ready data */
export const examResults = query({
  args: {
    schoolId: v.id("schools"),
    examId: v.id("exams"),
  },
  handler: async (ctx, { schoolId, examId }) => {
    await requirePrincipal(ctx, schoolId);

    const results = await ctx.db
      .query("exam_results")
      .withIndex("by_examId", (q) => q.eq("examId", examId))
      .take(5000);

    // Resolve student names
    const studentIds = [...new Set(results.map((r) => r.studentId))];
    const students = await Promise.all(studentIds.map((id) => ctx.db.get(id)));
    const studentMap = new Map(
      students.filter(Boolean).map((s) => [s!._id, `${s!.firstName} ${s!.lastName}`])
    );

    // Resolve subject names
    const subjectIds = [...new Set(results.map((r) => r.subjectId))];
    const subjects = await Promise.all(subjectIds.map((id) => ctx.db.get(id)));
    const subjectMap = new Map(subjects.filter(Boolean).map((s) => [s!._id, s!.name]));

    return results.map((r: any) => ({
      Student: studentMap.get(r.studentId) ?? "",
      Subject: subjectMap.get(r.subjectId) ?? "",
      Marks: r.marks ?? 0,
      Grade: r.grade ?? "",
      Comments: r.comments ?? "",
    }));
  },
});

/** Export attendance as CSV-ready data */
export const attendance = query({
  args: {
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
  },
  handler: async (ctx, { schoolId, classId, startDate, endDate }) => {
    await requirePrincipal(ctx, schoolId);

    const start = startDate ?? 0;
    const end = endDate ?? Date.now();

    const allRecords = await ctx.db
      .query("attendance")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);

    const records = allRecords.filter(
      (r) => r.classId === classId && r.date >= start && r.date <= end
    );

    // Resolve student names
    const studentIds = [...new Set(records.map((r) => r.studentId))];
    const students = await Promise.all(studentIds.map((id) => ctx.db.get(id)));
    const studentMap = new Map(
      students.filter(Boolean).map((s) => [s!._id, `${s!.firstName} ${s!.lastName}`])
    );

    return records.map((r) => ({
      Date: new Date(r.date).toISOString().slice(0, 10),
      Student: studentMap.get(r.studentId) ?? "",
      Status: r.status,
      Remarks: r.note ?? "",
    }));
  },
});

/** Export fee payments as CSV-ready data */
export const feePayments = query({
  args: {
    schoolId: v.id("schools"),
    termId: v.optional(v.id("terms")),
  },
  handler: async (ctx, { schoolId, termId }) => {
    await requirePrincipal(ctx, schoolId);

    const q = ctx.db
      .query("fee_payments")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId));

    const payments = await q.take(2000);

    // Filter by term if specified
    const filtered = termId ? payments.filter((p) => p.termId === termId) : payments;

    // Resolve student names
    const studentIds = [...new Set(filtered.map((p) => p.studentId))];
    const students = await Promise.all(studentIds.map((id) => ctx.db.get(id)));
    const studentMap = new Map(
      students.filter(Boolean).map((s) => [s!._id, `${s!.firstName} ${s!.lastName}`])
    );

    return filtered.map((p) => ({
      Date: new Date(p.receivedAt).toISOString().slice(0, 10),
      Student: studentMap.get(p.studentId) ?? "",
      Amount: p.amount,
      Method: p.method,
      Reference: p.reference ?? "",
      "Received By": p.receivedBy ?? "",
    }));
  },
});

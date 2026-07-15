import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  logAuditEntry,
} from "./helpers";

export const listByClassAndDate = query({
  args: {
    classId: v.id("classes"),
    date: v.float64(),
  },
  handler: async (ctx, { classId, date }) => {
    const cls = await ctx.db.get(classId);
    if (!cls) throw new Error("Class not found");
    await requireSchoolMembership(ctx, cls.schoolId);

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return await ctx.db
      .query("attendance")
      .withIndex("by_classId_and_date", (q) =>
        q.eq("classId", classId).gte("date", dayStart.getTime()).lte("date", dayEnd.getTime())
      )
      .take(500);
  },
});

export const listByStudent = query({
  args: {
    studentId: v.id("students"),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
  },
  handler: async (ctx, { studentId, startDate, endDate }) => {
    const student = await ctx.db.get(studentId);
    if (!student) throw new Error("Student not found");
    await requireSchoolMembership(ctx, student.schoolId);

    let q = ctx.db
      .query("attendance")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId));

    if (startDate !== undefined) {
      q = q.filter((q) => q.gte(q.field("date"), startDate!));
    }
    if (endDate !== undefined) {
      q = q.filter((q) => q.lte(q.field("date"), endDate!));
    }

    return await q.take(1000);
  },
});

export const getSummaryByClass = query({
  args: {
    classId: v.id("classes"),
    startDate: v.float64(),
    endDate: v.float64(),
  },
  handler: async (ctx, { classId, startDate, endDate }) => {
    const cls = await ctx.db.get(classId);
    if (!cls) throw new Error("Class not found");
    await requireSchoolMembership(ctx, cls.schoolId);

    const records = await ctx.db
      .query("attendance")
      .withIndex("by_classId_and_date", (q) =>
        q.eq("classId", classId).gte("date", startDate).lte("date", endDate)
      )
      .take(5000);

    const summary: Record<string, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of records) {
      summary[r.status]++;
    }
    return { total: records.length, summary };
  },
});

export const markAttendance = mutation({
  args: {
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    date: v.float64(),
    markedBy: v.string(),
    records: v.array(v.object({
      studentId: v.id("students"),
      status: v.union(
        v.literal("present"),
        v.literal("absent"),
        v.literal("late"),
        v.literal("excused"),
      ),
      note: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    const dayStart = new Date(args.date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(args.date);
    dayEnd.setHours(23, 59, 59, 999);

    for (const r of args.records) {
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_classId_and_date", (q) =>
          q.eq("classId", args.classId).gte("date", dayStart.getTime()).lte("date", dayEnd.getTime())
        )
        .filter((q) => q.eq(q.field("studentId"), r.studentId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          status: r.status,
          note: r.note,
          markedBy: args.markedBy,
        });
      } else {
        await ctx.db.insert("attendance", {
          schoolId: args.schoolId,
          classId: args.classId,
          streamId: args.streamId,
          studentId: r.studentId,
          date: dayStart.getTime(),
          status: r.status,
          markedBy: args.markedBy,
          note: r.note,
        });
      }
    }

    await logAuditEntry(ctx, args.schoolId, "attendance.mark", {
      classId: args.classId,
      date: args.date,
      count: args.records.length,
    });
  },
});

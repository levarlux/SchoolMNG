import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  logAuditEntry,
} from "./helpers";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("timetable_entries")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(1000);
  },
});

export const listByClass = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, { classId }) => {
    const cls = await ctx.db.get(classId);
    if (!cls) throw new Error("Class not found");
    await requireSchoolMembership(ctx, cls.schoolId);
    return await ctx.db
      .query("timetable_entries")
      .withIndex("by_classId", (q) => q.eq("classId", classId))
      .take(200);
  },
});

export const listByTeacher = query({
  args: { teacherId: v.id("teachers") },
  handler: async (ctx, { teacherId }) => {
    const teacher = await ctx.db.get(teacherId);
    if (!teacher) throw new Error("Teacher not found");
    await requireSchoolMembership(ctx, teacher.schoolId);
    return await ctx.db
      .query("timetable_entries")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", teacherId))
      .take(200);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    subjectId: v.id("subjects"),
    teacherId: v.optional(v.id("teachers")),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    room: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    const conflicting = await ctx.db
      .query("timetable_entries")
      .withIndex("by_classId", (q) => q.eq("classId", args.classId))
      .filter((q) =>
        q.eq(q.field("dayOfWeek"), args.dayOfWeek) &&
        q.lt(q.field("startTime"), args.endTime) &&
        q.gt(q.field("endTime"), args.startTime)
      )
      .first();
    if (conflicting) {
      throw new Error("Time slot conflicts with an existing entry for this class");
    }

    if (args.teacherId) {
      const teacherConflict = await ctx.db
        .query("timetable_entries")
        .withIndex("by_teacherId", (q) => q.eq("teacherId", args.teacherId!))
        .filter((q) =>
          q.eq(q.field("dayOfWeek"), args.dayOfWeek) &&
          q.lt(q.field("startTime"), args.endTime) &&
          q.gt(q.field("endTime"), args.startTime)
        )
        .first();
      if (teacherConflict) {
        throw new Error("Time slot conflicts with the teacher's existing schedule");
      }
    }

    const entryId = await ctx.db.insert("timetable_entries", args);
    await logAuditEntry(ctx, args.schoolId, "timetable.create", {
      entryId,
      classId: args.classId,
      dayOfWeek: args.dayOfWeek,
    });
    return entryId;
  },
});

export const remove = mutation({
  args: { id: v.id("timetable_entries") },
  handler: async (ctx, { id }) => {
    const entry = await ctx.db.get(id);
    if (!entry) throw new Error("Timetable entry not found");
    await requireSchoolMembership(ctx, entry.schoolId);
    await ctx.db.delete(id);
    await logAuditEntry(ctx, entry.schoolId, "timetable.remove", { entryId: id });
  },
});

export const clearClassTimetable = mutation({
  args: { classId: v.id("classes") },
  handler: async (ctx, { classId }) => {
    const cls = await ctx.db.get(classId);
    if (!cls) throw new Error("Class not found");
    await requireSchoolMembership(ctx, cls.schoolId);

    const entries = await ctx.db
      .query("timetable_entries")
      .withIndex("by_classId", (q) => q.eq("classId", classId))
      .take(200);
    for (const e of entries) {
      await ctx.db.delete(e._id);
    }

    await logAuditEntry(ctx, cls.schoolId, "timetable.clearClass", { classId });
  },
});

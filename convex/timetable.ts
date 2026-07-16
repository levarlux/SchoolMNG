import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireAuth,
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

/** Get the current user's personal timetable for the week. */
export const listMyTimetable = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const identity = await requireAuth(ctx);
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("timetable_entries")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .take(200);
  },
});

/** Get another user's timetable (for principals viewing teachers). */
export const listByUser = query({
  args: { schoolId: v.id("schools"), userId: v.string() },
  handler: async (ctx, { schoolId, userId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("timetable_entries")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);
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
    const identity = await requireAuth(ctx);
    await requireSchoolMembership(ctx, args.schoolId);

    // Conflict check: same user, same day, overlapping time
    const userConflict = await ctx.db
      .query("timetable_entries")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .filter((q) =>
        q.eq(q.field("dayOfWeek"), args.dayOfWeek) &&
        q.lt(q.field("startTime"), args.endTime) &&
        q.gt(q.field("endTime"), args.startTime)
      )
      .first();
    if (userConflict) {
      const subject = await ctx.db.get(userConflict.subjectId);
      const cls = await ctx.db.get(userConflict.classId);
      const subjectName = subject?.name ?? "Unknown";
      const className = cls?.name ?? "Unknown";
      const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      throw new Error(
        `Time conflict: ${subjectName} (${className}) is already scheduled on ${DAY_NAMES[userConflict.dayOfWeek]} from ${userConflict.startTime} to ${userConflict.endTime}. Delete or move that entry first.`
      );
    }

    const entryId = await ctx.db.insert("timetable_entries", {
      ...args,
      userId: identity.subject,
    });
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

    const identity = await requireAuth(ctx);
    // Only the owner or superadmin can delete
    const isSuperadmin = await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .first();
    if (entry.userId !== identity.subject && !isSuperadmin) {
      throw new Error("You can only delete your own timetable entries");
    }

    await ctx.db.delete(id);
    await logAuditEntry(ctx, entry.schoolId, "timetable.remove", { entryId: id });
  },
});

/** Clear all of the current user's timetable entries. */
export const clearMyTimetable = mutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const identity = await requireAuth(ctx);
    await requireSchoolMembership(ctx, schoolId);

    const entries = await ctx.db
      .query("timetable_entries")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .take(200);
    for (const e of entries) {
      await ctx.db.delete(e._id);
    }

    await logAuditEntry(ctx, schoolId, "timetable.clearMyTimetable", {});
  },
});

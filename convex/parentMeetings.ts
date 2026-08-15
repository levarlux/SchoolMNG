import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, logAuditEntry } from "./helpers";

export const listByTeacher = query({
  args: { teacherId: v.id("teachers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("parent_meetings")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", args.teacherId))
      .order("desc")
      .take(100);
  },
});

export const listByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Parent Meetings");
    return await ctx.db
      .query("parent_meetings")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(50);
  },
});

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("parent_meetings")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    studentId: v.optional(v.id("students")),
    date: v.float64(),
    topic: v.string(),
    notes: v.optional(v.string()),
    outcome: v.optional(v.string()),
    followUpDate: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const id = await ctx.db.insert("parent_meetings", args);
    await logAuditEntry(ctx, args.schoolId, "parentMeeting.create", {
      meetingId: id,
      teacherId: args.teacherId,
      topic: args.topic,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("parent_meetings"),
    topic: v.optional(v.string()),
    notes: v.optional(v.string()),
    outcome: v.optional(v.string()),
    followUpDate: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.id);
    if (!meeting) throw new Error("Meeting not found");
    await requireSchoolMembership(ctx, meeting.schoolId);
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.topic !== undefined) updates.topic = fields.topic;
    if (fields.notes !== undefined) updates.notes = fields.notes;
    if (fields.outcome !== undefined) updates.outcome = fields.outcome;
    if (fields.followUpDate !== undefined) updates.followUpDate = fields.followUpDate;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("parent_meetings") },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.id);
    if (!meeting) throw new Error("Meeting not found");
    await requireSchoolMembership(ctx, meeting.schoolId);
    await ctx.db.delete(args.id);
  },
});

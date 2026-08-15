import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

export const listByDate = query({
  args: { schoolId: v.id("schools"), date: v.float64() },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("staff_attendance")
      .withIndex("by_schoolId_date", (q) =>
        q.eq("schoolId", args.schoolId).eq("date", args.date)
      )
      .take(200);
  },
});

export const listByTeacher = query({
  args: { teacherId: v.id("teachers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("staff_attendance")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", args.teacherId))
      .order("desc")
      .take(100);
  },
});

export const checkIn = mutation({
  args: {
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    date: v.float64(),
    status: v.union(
      v.literal("present"),
      v.literal("late"),
      v.literal("excused"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    // Check if already checked in today
    const existing = await ctx.db
      .query("staff_attendance")
      .withIndex("by_teacherId_date", (q) =>
        q.eq("teacherId", args.teacherId).eq("date", args.date)
      )
      .first();
    if (existing) {
      throw new Error("Already checked in for this date");
    }
    const now = new Date();
    const checkInTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const id = await ctx.db.insert("staff_attendance", {
      schoolId: args.schoolId,
      teacherId: args.teacherId,
      date: args.date,
      status: args.status,
      checkInTime,
      note: args.note,
    });
    await logAuditEntry(ctx, args.schoolId, "staffAttendance.checkIn", {
      attendanceId: id,
      teacherId: args.teacherId,
    });
    return id;
  },
});

export const checkOut = mutation({
  args: { id: v.id("staff_attendance") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Attendance record not found");
    await requireSchoolMembership(ctx, record.schoolId);
    const now = new Date();
    const checkOutTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    await ctx.db.patch(args.id, { checkOutTime });
  },
});

export const markAbsent = mutation({
  args: {
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    date: v.float64(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "HR & Performance");
    const existing = await ctx.db
      .query("staff_attendance")
      .withIndex("by_teacherId_date", (q) =>
        q.eq("teacherId", args.teacherId).eq("date", args.date)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { status: "absent", note: args.note });
      return existing._id;
    }
    return await ctx.db.insert("staff_attendance", {
      schoolId: args.schoolId,
      teacherId: args.teacherId,
      date: args.date,
      status: "absent",
      note: args.note,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("staff_attendance") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "HR & Performance");
    await ctx.db.delete(args.id);
  },
});

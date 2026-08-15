import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, logAuditEntry } from "./helpers";

// ── Visitor Log ───────────────────────────────────────────────────

export const listVisitors = query({
  args: { schoolId: v.id("schools"), date: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    if (args.date) {
      const startOfDay = args.date;
      const endOfDay = args.date + 24 * 60 * 60 * 1000;
      return await ctx.db
        .query("visitor_log")
        .withIndex("by_checkInTime", (q) =>
          q.eq("schoolId", args.schoolId).gte("checkInTime", startOfDay).lt("checkInTime", endOfDay)
        )
        .order("desc")
        .take(200);
    }
    return await ctx.db
      .query("visitor_log")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const checkInVisitor = mutation({
  args: {
    schoolId: v.id("schools"),
    visitorName: v.string(),
    idNumber: v.optional(v.string()),
    phone: v.optional(v.string()),
    purpose: v.string(),
    personToVisit: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const identity = await ctx.auth.getUserIdentity();
    return await ctx.db.insert("visitor_log", {
      ...args,
      checkInTime: Date.now(),
      recordedBy: identity?.subject ?? "system",
    });
  },
});

export const checkOutVisitor = mutation({
  args: { id: v.id("visitor_log") },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.id);
    if (!log) throw new Error("Visitor log not found");
    await requireSchoolMembership(ctx, log.schoolId);
    await ctx.db.patch(args.id, { checkOutTime: Date.now() });
  },
});

export const removeVisitorLog = mutation({
  args: { id: v.id("visitor_log") },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.id);
    if (!log) throw new Error("Log not found");
    await requireSchoolMembership(ctx, log.schoolId);
    await ctx.db.delete(args.id);
  },
});

// ── Gate Student Log (Early Leave / Late Arrival) ─────────────────

export const listStudentGateLog = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireStudentMembership(ctx, args.studentId);
    return await ctx.db
      .query("gate_student_log")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(50);
  },
});

export const listStudentGateLogByDate = query({
  args: { schoolId: v.id("schools"), date: v.float64() },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("gate_student_log")
      .withIndex("by_schoolId_date", (q) =>
        q.eq("schoolId", args.schoolId).eq("date", args.date)
      )
      .take(200);
  },
});

export const recordStudentGate = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    type: v.union(v.literal("early_leave"), v.literal("late_arrival")),
    time: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const identity = await ctx.auth.getUserIdentity();
    return await ctx.db.insert("gate_student_log", {
      ...args,
      approvedBy: identity?.subject ?? "system",
    });
  },
});

export const removeStudentGateLog = mutation({
  args: { id: v.id("gate_student_log") },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.id);
    if (!log) throw new Error("Log not found");
    await requireSchoolMembership(ctx, log.schoolId);
    await ctx.db.delete(args.id);
  },
});

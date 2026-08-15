import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { logAuditEntry } from "./helpers";

export const listBySchool = query({
  args: {
    schoolId: v.id("schools"),
    status: v.optional(v.string()),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("appointments")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc");

    let results = await q.take(500);

    if (args.status) {
      results = results.filter((a) => a.status === args.status);
    }
    if (args.startDate) {
      results = results.filter((a) => a.date >= args.startDate!);
    }
    if (args.endDate) {
      results = results.filter((a) => a.date <= args.endDate!);
    }

    return results;
  },
});

export const get = query({
  args: { id: v.id("appointments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    title: v.string(),
    date: v.float64(),
    startTime: v.string(),
    endTime: v.string(),
    location: v.optional(v.string()),
    withPerson: v.string(),
    purpose: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("appointments", {
      ...args,
      status: "scheduled",
      createdBy: identity?.subject ?? "system",
    });
    await logAuditEntry(ctx, args.schoolId, "appointment.create", {
      appointmentId: id,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("appointments"),
    status: v.union(
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("rescheduled")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Appointment not found");

    const patchData: Record<string, any> = { status: args.status };
    if (args.notes !== undefined) patchData.notes = args.notes;

    await ctx.db.patch(args.id, patchData);
    await logAuditEntry(ctx, existing.schoolId, "appointment.status_update", {
      appointmentId: args.id,
      status: args.status,
    });
  },
});

export const reschedule = mutation({
  args: {
    id: v.id("appointments"),
    date: v.float64(),
    startTime: v.string(),
    endTime: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Appointment not found");

    await ctx.db.patch(args.id, {
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      status: "rescheduled",
      ...(args.location ? { location: args.location } : {}),
    });
    await logAuditEntry(ctx, existing.schoolId, "appointment.reschedule", {
      appointmentId: args.id,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("appointments") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Appointment not found");
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, existing.schoolId, "appointment.remove", {
      appointmentId: args.id,
    });
  },
});

export const getStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(1000);

    const now = Date.now();
    return {
      total: appointments.length,
      scheduled: appointments.filter((a) => a.status === "scheduled").length,
      today: appointments.filter(
        (a) =>
          a.status === "scheduled" &&
          new Date(a.date).toDateString() === new Date(now).toDateString()
      ).length,
      completed: appointments.filter((a) => a.status === "completed").length,
      cancelled: appointments.filter((a) => a.status === "cancelled").length,
    };
  },
});

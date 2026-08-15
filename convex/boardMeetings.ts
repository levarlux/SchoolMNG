import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { logAuditEntry } from "./helpers";

export const listBySchool = query({
  args: {
    schoolId: v.id("schools"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("board_meetings")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc");

    if (args.status) {
      return await q
        .filter((q) => q.eq("status", args.status))
        .take(200);
    }
    return await q.take(200);
  },
});

export const get = query({
  args: { id: v.id("board_meetings") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    date: v.float64(),
    title: v.string(),
    attendees: v.array(v.string()),
    summary: v.optional(v.string()),
    actionItems: v.optional(v.array(v.string())),
    minutesDocumentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("board_meetings", {
      ...args,
      status: "scheduled",
      createdBy: identity?.subject ?? "system",
    });
    await logAuditEntry(ctx, args.schoolId, "board_meeting.create", {
      meetingId: id,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("board_meetings"),
    date: v.optional(v.float64()),
    title: v.optional(v.string()),
    attendees: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
    actionItems: v.optional(v.array(v.string())),
    minutesDocumentId: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("completed"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Meeting not found");

    const patchData: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patchData[key] = value;
    }

    await ctx.db.patch(id, patchData);
    await logAuditEntry(ctx, existing.schoolId, "board_meeting.update", {
      meetingId: id,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("board_meetings") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Meeting not found");
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, existing.schoolId, "board_meeting.remove", {
      meetingId: args.id,
    });
  },
});

export const getStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const meetings = await ctx.db
      .query("board_meetings")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);

    const now = Date.now();
    return {
      total: meetings.length,
      scheduled: meetings.filter((m) => m.status === "scheduled").length,
      completed: meetings.filter((m) => m.status === "completed").length,
      cancelled: meetings.filter((m) => m.status === "cancelled").length,
      upcoming: meetings
        .filter((m) => m.status === "scheduled" && m.date >= now)
        .sort((a, b) => a.date - b.date)
        .slice(0, 3)
        .map((m) => ({
          _id: m._id,
          title: m.title,
          date: m.date,
          attendees: m.attendees,
        })),
    };
  },
});

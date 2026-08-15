import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

export const listByDate = query({
  args: { schoolId: v.id("schools"), date: v.float64() },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("duty_roster_entries")
      .withIndex("by_schoolId_date", (q) =>
        q.eq("schoolId", args.schoolId).eq("date", args.date)
      )
      .take(100);
  },
});

export const listByTeacher = query({
  args: { teacherId: v.id("teachers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("duty_roster_entries")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", args.teacherId))
      .order("desc")
      .take(100);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    date: v.float64(),
    dutyType: v.union(
      v.literal("gate"),
      v.literal("lunch"),
      v.literal("compound"),
      v.literal("exam_supervision"),
      v.literal("other"),
    ),
    description: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "HR & Performance");
    const id = await ctx.db.insert("duty_roster_entries", args);
    await logAuditEntry(ctx, args.schoolId, "dutyRoster.create", {
      entryId: id,
      teacherId: args.teacherId,
      dutyType: args.dutyType,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("duty_roster_entries"),
    dutyType: v.optional(v.union(
      v.literal("gate"),
      v.literal("lunch"),
      v.literal("compound"),
      v.literal("exam_supervision"),
      v.literal("other"),
    )),
    description: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id);
    if (!entry) throw new Error("Entry not found");
    await requireModuleEditAccessByName(ctx, entry.schoolId, "HR & Performance");
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.dutyType !== undefined) updates.dutyType = fields.dutyType;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.startTime !== undefined) updates.startTime = fields.startTime;
    if (fields.endTime !== undefined) updates.endTime = fields.endTime;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("duty_roster_entries") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id);
    if (!entry) throw new Error("Entry not found");
    await requireModuleEditAccessByName(ctx, entry.schoolId, "HR & Performance");
    await ctx.db.delete(args.id);
  },
});

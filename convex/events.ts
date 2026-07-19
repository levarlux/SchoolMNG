import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  requirePrincipal,
  patchDefinedFields,
  logAuditEntry,
} from "./helpers";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("events")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
  },
});

export const listUpcoming = query({
  args: { schoolId: v.id("schools"), from: v.float64() },
  handler: async (ctx, { schoolId, from }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("events")
      .withIndex("by_startDate", (q) => q.eq("schoolId", schoolId).gte("startDate", from))
      .take(50);
  },
});

export const listByType = query({
  args: { schoolId: v.id("schools"), eventType: v.string() },
  handler: async (ctx, { schoolId, eventType }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("events")
      .withIndex("by_eventType", (q) => q.eq("schoolId", schoolId).eq("eventType", eventType as any))
      .take(200);
  },
});

export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, { id }) => {
    const event = await ctx.db.get(id);
    if (!event) throw new Error("Event not found");
    await requireSchoolMembership(ctx, event.schoolId);
    return event;
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    title: v.string(),
    description: v.optional(v.string()),
    startDate: v.float64(),
    endDate: v.float64(),
    eventType: v.union(
      v.literal("academic"),
      v.literal("holiday"),
      v.literal("exam"),
      v.literal("sports"),
      v.literal("cultural"),
      v.literal("meeting"),
      v.literal("other"),
    ),
    isHoliday: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const eventId = await ctx.db.insert("events", args);
    await logAuditEntry(ctx, args.schoolId, "event.create", {
      eventId,
      title: args.title,
      eventType: args.eventType,
    });
    return eventId;
  },
});

export const update = mutation({
  args: {
    id: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
    eventType: v.optional(
      v.union(
        v.literal("academic"),
        v.literal("holiday"),
        v.literal("exam"),
        v.literal("sports"),
        v.literal("cultural"),
        v.literal("meeting"),
        v.literal("other"),
      )
    ),
    isHoliday: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const event = await ctx.db.get(id);
    if (!event) throw new Error("Event not found");
    await requirePrincipal(ctx, event.schoolId);
    await patchDefinedFields(ctx, "events", id, updates);
    await logAuditEntry(ctx, event.schoolId, "event.update", { eventId: id, ...updates });
  },
});

export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, { id }) => {
    const event = await ctx.db.get(id);
    if (!event) throw new Error("Event not found");
    await requirePrincipal(ctx, event.schoolId);
    await ctx.db.delete(id);
    await logAuditEntry(ctx, event.schoolId, "event.remove", { eventId: id });
  },
});

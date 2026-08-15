import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { logAuditEntry } from "./helpers";

/** List announcements by school */
export const listBySchool = query({
  args: {
    schoolId: v.id("schools"),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.isPublished !== undefined) {
      return await ctx.db
        .query("announcements")
        .withIndex("by_published", (q) =>
          q.eq("schoolId", args.schoolId).eq("isPublished", args.isPublished!)
        )
        .order("desc")
        .take(100);
    }
    return await ctx.db
      .query("announcements")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(100);
  },
});

/** Get active (published, non-expired) announcements */
export const getActive = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const all = await ctx.db
      .query("announcements")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(500);
    return all.filter(
      (a) => a.isPublished && (!a.expiresAt || a.expiresAt > now)
    );
  },
});

/** Get single announcement */
export const get = query({
  args: { id: v.id("announcements") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Create announcement */
export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    title: v.string(),
    content: v.string(),
    priority: v.union(
      v.literal("low"),
      v.literal("normal"),
      v.literal("high"),
      v.literal("urgent")
    ),
    targetAudience: v.union(
      v.literal("all"),
      v.literal("staff_only"),
      v.literal("teachers_only"),
      v.literal("parents_only"),
      v.literal("students_only")
    ),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const now = Date.now();
    const id = await ctx.db.insert("announcements", {
      ...args,
      isPublished: true,
      publishedAt: now,
      createdAt: now,
      createdBy: identity?.subject ?? "system",
    });
    await logAuditEntry(ctx, args.schoolId, "announcement.create", { announcementId: id });
    return id;
  },
});

/** Update announcement */
export const update = mutation({
  args: {
    id: v.id("announcements"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    priority: v.optional(
      v.union(v.literal("low"), v.literal("normal"), v.literal("high"), v.literal("urgent"))
    ),
    targetAudience: v.optional(
      v.union(
        v.literal("all"),
        v.literal("staff_only"),
        v.literal("teachers_only"),
        v.literal("parents_only"),
        v.literal("students_only")
      )
    ),
    expiresAt: v.optional(v.number()),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const announcement = await ctx.db.get(id);
    if (!announcement) throw new Error("Announcement not found");

    const patched: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patched[key] = value;
    }
    await ctx.db.patch(id, patched);
    await logAuditEntry(ctx, announcement.schoolId, "announcement.update", { announcementId: id });
    return id;
  },
});

/** Remove announcement */
export const remove = mutation({
  args: { id: v.id("announcements") },
  handler: async (ctx, args) => {
    const announcement = await ctx.db.get(args.id);
    if (!announcement) throw new Error("Announcement not found");
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, announcement.schoolId, "announcement.remove", { announcementId: args.id });
  },
});

/** Get stats for announcements */
export const getStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("announcements")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);
    const now = Date.now();
    const published = all.filter((a) => a.isPublished);
    const active = published.filter((a) => !a.expiresAt || a.expiresAt > now);
    const expired = all.filter((a) => a.expiresAt && a.expiresAt <= now);
    const urgent = all.filter((a) => a.priority === "urgent" && a.isPublished);
    return {
      total: all.length,
      active: active.length,
      expired: expired.length,
      urgent: urgent.length,
    };
  },
});

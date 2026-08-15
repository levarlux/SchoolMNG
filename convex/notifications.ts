import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/** List notifications for a recipient */
export const listByRecipient = query({
  args: {
    recipientId: v.string(),
    status: v.optional(v.union(v.literal("unread"), v.literal("read"), v.literal("actioned"))),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("notifications")
      .withIndex("by_recipientId", (q) => q.eq("recipientId", args.recipientId))
      .order("desc");

    if (args.status) {
      return await q
        .filter((q) => q.eq("status", args.status))
        .take(50);
    }
    return await q.take(50);
  },
});

/** Get unread count for a recipient */
export const getUnreadCount = query({
  args: { recipientId: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_recipientId", (q) => q.eq("recipientId", args.recipientId))
      .take(100);
    return all.filter((n) => n.status === "unread").length;
  },
});

/** Get single notification */
export const get = query({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Send a notification (create it) */
export const send = mutation({
  args: {
    schoolId: v.id("schools"),
    ruleId: v.optional(v.string()),
    recipientId: v.string(),
    recipientRole: v.string(),
    relatedRecordId: v.optional(v.string()),
    title: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("notifications", {
      ...args,
      status: "unread",
      createdAt: Date.now(),
    });
    return id;
  },
});

/** Send batch notifications to multiple recipients */
export const sendBatch = mutation({
  args: {
    schoolId: v.id("schools"),
    ruleId: v.optional(v.string()),
    relatedRecordId: v.optional(v.string()),
    title: v.string(),
    message: v.string(),
    recipients: v.array(
      v.object({
        recipientId: v.string(),
        recipientRole: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids: string[] = [];
    for (const r of args.recipients) {
      const id = await ctx.db.insert("notifications", {
        schoolId: args.schoolId,
        ruleId: args.ruleId,
        relatedRecordId: args.relatedRecordId,
        recipientId: r.recipientId,
        recipientRole: r.recipientRole,
        title: args.title,
        message: args.message,
        status: "unread",
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

/** Mark a notification as read */
export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const notif = await ctx.db.get(args.id);
    if (!notif) throw new Error("Notification not found");
    await ctx.db.patch(args.id, { status: "read" });
  },
});

/** Mark all notifications as read for a recipient */
export const markAllRead = mutation({
  args: { recipientId: v.string() },
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipientId", (q) => q.eq("recipientId", args.recipientId))
      .take(100);
    for (const n of unread) {
      if (n.status === "unread") {
        await ctx.db.patch(n._id, { status: "read" });
      }
    }
  },
});

/** Mark a notification as actioned */
export const markActioned = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const notif = await ctx.db.get(args.id);
    if (!notif) throw new Error("Notification not found");
    await ctx.db.patch(args.id, { status: "actioned" });
  },
});

/** Delete a notification */
export const remove = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const notif = await ctx.db.get(args.id);
    if (!notif) throw new Error("Notification not found");
    await ctx.db.delete(args.id);
  },
});

/** Get stats for a school */
export const getStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_schoolId_status", (q) => q.eq("schoolId", args.schoolId))
      .take(500);
    return {
      total: all.length,
      unread: all.filter((n) => n.status === "unread").length,
      read: all.filter((n) => n.status === "read").length,
      actioned: all.filter((n) => n.status === "actioned").length,
    };
  },
});

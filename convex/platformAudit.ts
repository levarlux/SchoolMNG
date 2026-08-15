import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireSuperadmin } from "./helpers";

/**
 * Platform Audit Log — tracks superadmin actions across all schools.
 */

/** Log a superadmin action */
export const logAction = mutation({
  args: {
    action: v.string(),
    targetSchoolId: v.optional(v.id("schools")),
    targetSchoolName: v.optional(v.string()),
    details: v.optional(v.any()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await ctx.db.insert("platform_audit_logs", {
      adminUserId: identity.subject,
      adminEmail: identity.email,
      targetSchoolId: args.targetSchoolId,
      targetSchoolName: args.targetSchoolName,
      action: args.action,
      details: args.details,
      reason: args.reason,
      timestamp: Date.now(),
    });
  },
});

/** List audit log entries (superadmin only) */
export const listEntries = query({
  args: {
    limit: v.optional(v.number()),
    adminUserId: v.optional(v.string()),
    targetSchoolId: v.optional(v.id("schools")),
    action: v.optional(v.string()),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);

    let entries;

    if (args.adminUserId) {
      entries = await ctx.db
        .query("platform_audit_logs")
        .withIndex("by_adminUserId", (q) => q.eq("adminUserId", args.adminUserId!))
        .order("desc")
        .take(args.limit ?? 100);
    } else if (args.targetSchoolId) {
      entries = await ctx.db
        .query("platform_audit_logs")
        .withIndex("by_targetSchoolId", (q) => q.eq("targetSchoolId", args.targetSchoolId!))
        .order("desc")
        .take(args.limit ?? 100);
    } else {
      entries = await ctx.db
        .query("platform_audit_logs")
        .withIndex("by_timestamp", (q) => q.gte("timestamp", 0))
        .order("desc")
        .take(args.limit ?? 100);
    }

    // Apply additional filters in-memory
    let filtered = entries;
    if (args.action) {
      filtered = filtered.filter((e) => e.action === args.action);
    }
    if (args.startDate) {
      filtered = filtered.filter((e) => e.timestamp >= args.startDate!);
    }
    if (args.endDate) {
      filtered = filtered.filter((e) => e.timestamp <= args.endDate!);
    }

    return filtered;
  },
});

/** Get recent audit entries (for realtime notifications) */
export const getRecentEntries = query({
  args: {
    since: v.optional(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("platform_audit_logs")
      .withIndex("by_timestamp", (q) =>
        args.since ? q.gte("timestamp", args.since!) : q.gte("timestamp", 0)
      )
      .order("desc")
      .take(args.limit ?? 10);

    return entries.map((e) => ({
      id: e._id,
      action: e.action,
      adminEmail: e.adminEmail ?? null,
      targetSchoolName: e.targetSchoolName ?? null,
      reason: e.reason ?? null,
      timestamp: e.timestamp,
    }));
  },
});

/** Get audit stats */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);

    const entries = await ctx.db
      .query("platform_audit_logs")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", 0))
      .take(1000);

    const actionCounts: Record<string, number> = {};
    for (const entry of entries) {
      actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;
    }

    const adminCounts: Record<string, number> = {};
    for (const entry of entries) {
      const email = entry.adminEmail ?? entry.adminUserId;
      adminCounts[email] = (adminCounts[email] || 0) + 1;
    }

    return {
      totalEntries: entries.length,
      actionCounts,
      adminCounts,
    };
  },
});

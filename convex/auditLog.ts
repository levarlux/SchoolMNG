import { v } from "convex/values";
import { query } from "./_generated/server";
import { requirePrincipal } from "./helpers";

/**
 * Audit Log — query the audit trail.
 * Audit entries are written by logAuditEntry() in helpers.ts into report_logs.
 * This module provides filtered views for the audit log page.
 */

/** List audit entries for a school, filtered by module/action */
export const listEntries = query({
  args: {
    schoolId: v.id("schools"),
    module: v.optional(v.string()), // filter by module prefix e.g. "student" matches "student.create"
    action: v.optional(v.string()), // exact action match
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { schoolId, module, action, startDate, endDate, limit }) => {
    await requirePrincipal(ctx, schoolId);

    const q = ctx.db
      .query("report_logs")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId));

    const entries = await q.take(limit ?? 100);

    // Apply filters in-memory (report_logs doesn't have action-specific indexes)
    let filtered = entries;

    if (module) {
      filtered = filtered.filter((e) => e.reportType.startsWith(module));
    }
    if (action) {
      filtered = filtered.filter((e) => e.reportType === action);
    }
    if (startDate) {
      filtered = filtered.filter((e) => e._creationTime >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((e) => e._creationTime <= endDate);
    }

    return filtered.sort((a, b) => b._creationTime - a._creationTime);
  },
});

/** Get audit stats — action counts for a school */
export const getStats = query({
  args: {
    schoolId: v.id("schools"),
  },
  handler: async (ctx, { schoolId }) => {
    await requirePrincipal(ctx, schoolId);

    const entries = await ctx.db
      .query("report_logs")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(1000);

    // Group by action type
    const actionCounts: Record<string, number> = {};
    for (const entry of entries) {
      const action = entry.reportType;
      actionCounts[action] = (actionCounts[action] || 0) + 1;
    }

    // Group by module (first word before the dot)
    const moduleCounts: Record<string, number> = {};
    for (const entry of entries) {
      const module = entry.reportType.split(".")[0] || "unknown";
      moduleCounts[module] = (moduleCounts[module] || 0) + 1;
    }

    return {
      totalEntries: entries.length,
      actionCounts,
      moduleCounts,
    };
  },
});

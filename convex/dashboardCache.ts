import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/** How long a cache entry stays fresh (1 hour in ms). */
export const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Read from the dashboard cache. Returns null if missing or stale.
 */
export const getCachedDashboard = internalQuery({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const entry = await ctx.db
      .query("dashboard_cache")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (!entry) return null;
    if (Date.now() - entry.computedAt > CACHE_TTL_MS) return null;
    return { stats: entry.stats, analytics: entry.analytics, computedAt: entry.computedAt };
  },
});

/**
 * Write dashboard stats to the cache. Only updates the stats field —
 * does NOT overwrite analytics (which may be set by a concurrent query).
 */
export const cacheStats = internalMutation({
  args: {
    schoolId: v.id("schools"),
    stats: v.any(),
  },
  handler: async (ctx, { schoolId, stats }) => {
    const existing = await ctx.db
      .query("dashboard_cache")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { stats, computedAt: Date.now() });
    } else {
      await ctx.db.insert("dashboard_cache", {
        schoolId,
        stats,
        analytics: null,
        computedAt: Date.now(),
      });
    }
  },
});

/**
 * Write dashboard analytics to the cache. Only updates the analytics field —
 * does NOT overwrite stats (which may be set by a concurrent query).
 */
export const cacheAnalytics = internalMutation({
  args: {
    schoolId: v.id("schools"),
    analytics: v.any(),
  },
  handler: async (ctx, { schoolId, analytics }) => {
    const existing = await ctx.db
      .query("dashboard_cache")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { analytics, computedAt: Date.now() });
    } else {
      await ctx.db.insert("dashboard_cache", {
        schoolId,
        stats: null,
        analytics,
        computedAt: Date.now(),
      });
    }
  },
});

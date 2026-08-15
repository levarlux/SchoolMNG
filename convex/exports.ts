import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requirePrincipal } from "./helpers";

/**
 * Export history (Files library in Bulk Operations).
 *
 * Every export the school generates is recorded here — who exported what,
 * when, and how many rows. The CSV itself is always regenerated from live
 * data on demand; the row is the retrievable, deletable record in the hub.
 */

export const listExportRuns = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("export_runs")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(100);
  },
});

export const recordExportRun = mutation({
  args: {
    schoolId: v.id("schools"),
    kind: v.string(),
    label: v.string(),
    fileName: v.string(),
    rowCount: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const identity = await ctx.auth.getUserIdentity();
    return await ctx.db.insert("export_runs", {
      schoolId: args.schoolId,
      kind: args.kind,
      label: args.label,
      fileName: args.fileName,
      rowCount: args.rowCount,
      ranBy: identity?.subject ?? "unknown",
      runAt: Date.now(),
    });
  },
});

export const deleteExportRun = mutation({
  args: { id: v.id("export_runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    // Idempotent delete — same rationale as imports.deleteImportRun.
    if (!run) return;
    await requirePrincipal(ctx, run.schoolId);
    await ctx.db.delete(args.id);
  },
});

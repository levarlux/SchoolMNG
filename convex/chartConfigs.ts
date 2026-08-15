/**
 * Chart Configuration (§5 — per-page chart customization)
 *
 * Lets schools configure which charts appear on each dashboard page,
 * reorder them, rename titles, toggle visibility, and set custom colors.
 *
 * Default configs are seeded on first access (lazy seeding) so existing
 * schools get the current hardcoded layout without a migration.
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireSchoolMembership } from "./helpers";

// ── Default chart definitions per page ──────────────────────────────

interface ChartDef {
  chartKey: string;
  chartType: string;
  title: string;
  description?: string;
  position: number;
  color?: string;
}

const DEFAULTS: Record<string, ChartDef[]> = {
  dashboard: [
    { chartKey: "fee_collection_trend", chartType: "line", title: "Fee Collection Trend", description: "Weekly collections, last 12 weeks", position: 10, color: "#22c55e" },
    { chartKey: "fee_collection_by_class", chartType: "horizontalBar", title: "Fee Collection by Class", description: "Expected vs collected, current term", position: 20 },
    { chartKey: "payment_methods", chartType: "doughnut", title: "Payment Methods", description: "How fees are being paid", position: 30 },
    { chartKey: "collection_rate", chartType: "radial", title: "Collection Rate", description: "Percentage of expected fees collected", position: 40, color: "#22c55e" },
    { chartKey: "exam_mean_trend", chartType: "line", title: "Exam Mean Trend", description: "Average marks across exams", position: 50, color: "#8b5cf6" },
    { chartKey: "performance_by_class", chartType: "bar", title: "Performance by Class", description: "Mean marks on the latest exam", position: 60 },
    { chartKey: "subject_averages", chartType: "horizontalBar", title: "Subject Averages", description: "Mean marks per subject, latest exam", position: 70, color: "#8b5cf6" },
    { chartKey: "attendance_rate_trend", chartType: "line", title: "Daily Attendance Rate", description: "Last 14 days", position: 80, color: "#10b981" },
    { chartKey: "attendance_today", chartType: "doughnut", title: "Today's Status", description: "Present/Absent/Late/Excused breakdown", position: 90 },
    { chartKey: "attendance_by_class", chartType: "horizontalBar", title: "Attendance by Class", description: "Last 30 days — lowest first", position: 100, color: "#10b981" },
    { chartKey: "borrowings_over_time", chartType: "line", title: "Borrowings Over Time", description: "Weekly borrowing activity", position: 110 },
    { chartKey: "students_per_class", chartType: "bar", title: "Students per Class", description: "Class size distribution", position: 120 },
  ],
  finance: [
    { chartKey: "fee_collection_trend", chartType: "line", title: "Fee Collection Trend", description: "Weekly collections", position: 10, color: "#22c55e" },
    { chartKey: "fee_by_class", chartType: "horizontalBar", title: "Fee Collection by Class", description: "Expected vs collected", position: 20 },
    { chartKey: "payment_methods", chartType: "doughnut", title: "Payment Methods", position: 30 },
    { chartKey: "outstanding_by_student", chartType: "bar", title: "Outstanding Balances", description: "Top 10 students with outstanding fees", position: 40, color: "#ef4444" },
  ],
  attendance: [
    { chartKey: "attendance_rate_trend", chartType: "line", title: "Attendance Rate Trend", description: "Daily rate over time", position: 10, color: "#10b981" },
    { chartKey: "attendance_by_class", chartType: "horizontalBar", title: "By Class", position: 20, color: "#10b981" },
    { chartKey: "attendance_by_stream", chartType: "horizontalBar", title: "By Stream", position: 30 },
    { chartKey: "attendance_status_breakdown", chartType: "doughnut", title: "Status Breakdown", position: 40 },
  ],
  analytics: [
    { chartKey: "system_overview", chartType: "bar", title: "System Overview", description: "Schools, students, books at a glance", position: 10 },
    { chartKey: "school_comparison", chartType: "bar", title: "School Comparison", description: "Top 5 schools by student count", position: 20 },
    { chartKey: "health_scores", chartType: "doughnut", title: "Health Scores", description: "Distribution of school health scores", position: 30, color: "#22c55e" },
  ],
};

// ── Query: list configs for a page (lazy-seeds defaults) ────────────

export const listByPage = query({
  args: {
    schoolId: v.id("schools"),
    page: v.string(),
  },
  handler: async (ctx, { schoolId, page }) => {
    await requireSchoolMembership(ctx, schoolId);

    let configs = await ctx.db
      .query("chart_configs")
      .withIndex("by_schoolId_page", (q) =>
        q.eq("schoolId", schoolId).eq("page", page)
      )
      .collect();

    // Lazy-seed: if no configs exist for this page, return the defaults
    // (they'll be persisted on first mutation)
    if (configs.length === 0) {
      const defaults = DEFAULTS[page] ?? [];
      return defaults.map((d) => ({
        _id: null,
        schoolId,
        page,
        chartKey: d.chartKey,
        chartType: d.chartType,
        title: d.title,
        description: d.description ?? null,
        isVisible: true,
        position: d.position,
        color: d.color ?? null,
        options: null,
        isDefault: true,
      }));
    }

    return configs
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ ...c, isDefault: false }));
  },
});

// ── Query: get a single config by key ───────────────────────────────

export const getByKey = query({
  args: {
    schoolId: v.id("schools"),
    page: v.string(),
    chartKey: v.string(),
  },
  handler: async (ctx, { schoolId, page, chartKey }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("chart_configs")
      .withIndex("by_schoolId_page_key", (q) =>
        q.eq("schoolId", schoolId).eq("page", page).eq("chartKey", chartKey)
      )
      .first();
  },
});

// ── Mutation: upsert a chart config (create or update) ─────────────

export const upsert = mutation({
  args: {
    schoolId: v.id("schools"),
    page: v.string(),
    chartKey: v.string(),
    chartType: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isVisible: v.optional(v.boolean()),
    position: v.optional(v.number()),
    color: v.optional(v.string()),
    options: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const now = Date.now();

    const existing = await ctx.db
      .query("chart_configs")
      .withIndex("by_schoolId_page_key", (q) =>
        q.eq("schoolId", args.schoolId).eq("page", args.page).eq("chartKey", args.chartKey)
      )
      .first();

    if (existing) {
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.chartType !== undefined) updates.chartType = args.chartType;
      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.description = args.description;
      if (args.isVisible !== undefined) updates.isVisible = args.isVisible;
      if (args.position !== undefined) updates.position = args.position;
      if (args.color !== undefined) updates.color = args.color;
      if (args.options !== undefined) updates.options = args.options;
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    // Look up the default definition for sensible defaults
    const defaults = DEFAULTS[args.page] ?? [];
    const def = defaults.find((d) => d.chartKey === args.chartKey);

    return await ctx.db.insert("chart_configs", {
      schoolId: args.schoolId,
      page: args.page,
      chartKey: args.chartKey,
      chartType: args.chartType ?? def?.chartType ?? "bar",
      title: args.title ?? def?.title ?? args.chartKey,
      description: args.description ?? def?.description,
      isVisible: args.isVisible ?? true,
      position: args.position ?? def?.position ?? 999,
      color: args.color ?? def?.color,
      options: args.options,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ── Mutation: reorder multiple charts at once ───────────────────────

export const reorder = mutation({
  args: {
    schoolId: v.id("schools"),
    page: v.string(),
    chartKeys: v.array(v.string()), // ordered list — index = new position
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const now = Date.now();

    for (let i = 0; i < args.chartKeys.length; i++) {
      const existing = await ctx.db
        .query("chart_configs")
        .withIndex("by_schoolId_page_key", (q) =>
          q.eq("schoolId", args.schoolId).eq("page", args.page).eq("chartKey", args.chartKeys[i])
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { position: (i + 1) * 10, updatedAt: now });
      }
    }

    return { ok: true };
  },
});

// ── Mutation: reset a page to defaults ──────────────────────────────

export const resetPage = mutation({
  args: {
    schoolId: v.id("schools"),
    page: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    // Delete all existing configs for this page
    const existing = await ctx.db
      .query("chart_configs")
      .withIndex("by_schoolId_page", (q) =>
        q.eq("schoolId", args.schoolId).eq("page", args.page)
      )
      .collect();

    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    return { ok: true, deleted: existing.length };
  },
});

// ── Mutation: toggle chart visibility ───────────────────────────────

export const toggleVisibility = mutation({
  args: {
    schoolId: v.id("schools"),
    page: v.string(),
    chartKey: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const now = Date.now();

    const existing = await ctx.db
      .query("chart_configs")
      .withIndex("by_schoolId_page_key", (q) =>
        q.eq("schoolId", args.schoolId).eq("page", args.page).eq("chartKey", args.chartKey)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isVisible: !existing.isVisible,
        updatedAt: now,
      });
      return { isVisible: !existing.isVisible };
    }

    // If no config exists, create one hidden
    const defaults = DEFAULTS[args.page] ?? [];
    const def = defaults.find((d) => d.chartKey === args.chartKey);
    const id = await ctx.db.insert("chart_configs", {
      schoolId: args.schoolId,
      page: args.page,
      chartKey: args.chartKey,
      chartType: def?.chartType ?? "bar",
      title: def?.title ?? args.chartKey,
      description: def?.description,
      isVisible: false,
      position: def?.position ?? 999,
      color: def?.color,
      options: null,
      createdAt: now,
      updatedAt: now,
    });
    return { isVisible: false, id };
  },
});

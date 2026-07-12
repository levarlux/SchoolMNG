import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireSuperadmin } from "./helpers";

// ── System-wide analytics (superadmin only) ────────────────────────

export const systemOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);

    const allStudents = await ctx.db.query("students").take(50000);
    const allBooks = await ctx.db.query("books").take(50000);
    const allBorrowingsList = await ctx.db.query("borrowings").take(50000);
    const activeBorrowingsList = allBorrowingsList.filter((b) => b.status === "borrowed");
    const allFines = await ctx.db.query("fines").take(50000);

    const totalStudents = allStudents.length;
    const totalBooks = allBooks.length;
    const activeBorrowings = activeBorrowingsList.length;
    const overdueCount = activeBorrowingsList.filter((b) => b.dueDate < Date.now()).length;
    const totalFines = allFines.reduce((sum, f) => sum + f.amount, 0);
    const unpaidFines = allFines
      .filter((f) => f.status === "unpaid")
      .reduce((sum, f) => sum + (f.amount - f.paidAmount), 0);

    const totalSubscriptions = (await ctx.db.query("subscriptions").take(1000)).length;
    const activeSubscriptions = (await ctx.db.query("subscriptions").take(1000)).filter(
      (s) => s.status === "active"
    ).length;

    return {
      totalSchools: (await ctx.db.query("schools").take(1000)).length,
      totalStudents,
      totalBooks,
      activeBorrowings,
      overdueCount,
      overdueRate: activeBorrowings > 0 ? Math.round((overdueCount / activeBorrowings) * 100) : 0,
      totalFines,
      unpaidFines,
      totalSubscriptions,
      activeSubscriptions,
    };
  },
});

export const schoolComparison = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);

    const schools = await ctx.db.query("schools").take(50);
    const results: {
      schoolId: Id<"schools">;
      schoolName: string;
      studentCount: number;
      bookCount: number;
      activeBorrowings: number;
      overdueCount: number;
      overdueRate: number;
      engagementRate: number;
      featureAdoption: number;
      healthScore: number;
    }[] = [];

    for (const school of schools) {
      const students = await ctx.db
        .query("students")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
        .collect();

      const books = await ctx.db
        .query("books")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
        .collect();

      const active = await ctx.db
        .query("borrowings")
        .withIndex("by_status", (q) => q.eq("schoolId", school._id).eq("status", "borrowed"))
        .collect();

      const allBorrowings = await ctx.db
        .query("borrowings")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
        .collect();

      const overdue = active.filter((b) => b.dueDate < Date.now());
      const features = await ctx.db
        .query("feature_configurations")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
        .collect();

      const featuresEnabled = features.filter((f) => f.isEnabled).length;
      const featureAdoption = features.length > 0 ? featuresEnabled / features.length : 0;

      const engagement = students.length > 0
        ? new Set(allBorrowings.map((b) => b.studentId)).size / students.length
        : 0;

      const overdueRate = active.length > 0 ? overdue.length / active.length : 0;

      const healthScore = Math.round(
        Math.min(100, engagement * 40 + (1 - overdueRate) * 30 + featureAdoption * 20 + 10)
      );

      results.push({
        schoolId: school._id,
        schoolName: school.name,
        studentCount: students.length,
        bookCount: books.length,
        activeBorrowings: active.length,
        overdueCount: overdue.length,
        overdueRate: Math.round(overdueRate * 100),
        engagementRate: Math.round(engagement * 100),
        featureAdoption: Math.round(featureAdoption * 100),
        healthScore,
      });
    }

    return results.sort((a, b) => b.healthScore - a.healthScore);
  },
});

// ── Snapshot management ────────────────────────────────────────────

export const takeSnapshot = mutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSuperadmin(ctx);

    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(10000);

    const books = await ctx.db
      .query("books")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(10000);

    const active = await ctx.db
      .query("borrowings")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "borrowed"))
      .take(10000);

    const allBorrowings = await ctx.db
      .query("borrowings")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(10000);

    const fines = await ctx.db
      .query("fines")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(10000);

    const features = await ctx.db
      .query("feature_configurations")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(100);

    return await ctx.db.insert("analytics_snapshots", {
      schoolId,
      snapshotDate: Date.now(),
      totalStudents: students.length,
      totalBooks: books.length,
      activeBorrowings: active.length,
      overdueCount: active.filter((b) => b.dueDate < Date.now()).length,
      totalBorrowingsAllTime: allBorrowings.length,
      totalFines: fines.reduce((sum, f) => sum + f.amount, 0),
      unpaidFines: fines
        .filter((f) => f.status === "unpaid")
        .reduce((sum, f) => sum + (f.amount - f.paidAmount), 0),
      featuresEnabled: features.filter((f) => f.isEnabled).length,
    });
  },
});

export const snapshotsHistory = query({
  args: {
    schoolId: v.id("schools"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { schoolId, limit }) => {
    await requireSuperadmin(ctx);
    return await ctx.db
      .query("analytics_snapshots")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .order("desc")
      .take(limit ?? 30);
  },
});

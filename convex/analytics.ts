import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireSuperadmin } from "./helpers";

// ── System-wide analytics (superadmin only) ────────────────────────

export const systemOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);

    const [allStudents, allBooks, allBorrowingsList, allFines, allSubscriptions, allSchools] =
      await Promise.all([
        ctx.db.query("students").take(50000),
        ctx.db.query("books").take(50000),
        ctx.db.query("borrowings").take(50000),
        ctx.db.query("fines").take(50000),
        ctx.db.query("subscriptions").take(1000),
        ctx.db.query("schools").take(1000),
      ]);

    const activeBorrowingsList = allBorrowingsList.filter((b) => b.status === "borrowed");
    const totalStudents = allStudents.length;
    const totalBooks = allBooks.length;
    const activeBorrowings = activeBorrowingsList.length;
    const overdueCount = activeBorrowingsList.filter((b) => b.dueDate < Date.now()).length;
    const totalFines = allFines.reduce((sum, f) => sum + f.amount, 0);
    const unpaidFines = allFines
      .filter((f) => f.status === "unpaid")
      .reduce((sum, f) => sum + (f.amount - f.paidAmount), 0);

    return {
      totalSchools: allSchools.length,
      totalStudents,
      totalBooks,
      activeBorrowings,
      overdueCount,
      overdueRate: activeBorrowings > 0 ? Math.round((overdueCount / activeBorrowings) * 100) : 0,
      totalFines,
      unpaidFines,
      totalSubscriptions: allSubscriptions.length,
      activeSubscriptions: allSubscriptions.filter((s) => s.status === "active").length,
    };
  },
});

export const schoolComparison = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);

    const schools = await ctx.db.query("schools").take(50);
    const schoolIds = new Set(schools.map((s) => s._id));

    const [allStudents, allBooks, allBorrowingsList, allFeatures] =
      await Promise.all([
        ctx.db.query("students").collect(),
        ctx.db.query("books").collect(),
        ctx.db.query("borrowings").collect(),
        ctx.db.query("feature_configurations").collect(),
      ]);

    const allActiveBorrowings = allBorrowingsList.filter((b) => b.status === "borrowed");

    const studentsBySchool = new Map<Id<"schools">, number>();
    const booksBySchool = new Map<Id<"schools">, number>();
    const activeBySchool = new Map<Id<"schools">, typeof allActiveBorrowings>();
    const borrowingsBySchool = new Map<Id<"schools">, typeof allBorrowingsList>();
    const featuresBySchool = new Map<Id<"schools">, typeof allFeatures>();

    for (const s of allStudents) {
      if (!schoolIds.has(s.schoolId)) continue;
      studentsBySchool.set(s.schoolId, (studentsBySchool.get(s.schoolId) ?? 0) + 1);
    }
    for (const b of allBooks) {
      if (!schoolIds.has(b.schoolId)) continue;
      booksBySchool.set(b.schoolId, (booksBySchool.get(b.schoolId) ?? 0) + 1);
    }
    for (const b of allActiveBorrowings) {
      if (!schoolIds.has(b.schoolId)) continue;
      const arr = activeBySchool.get(b.schoolId) ?? [];
      arr.push(b);
      activeBySchool.set(b.schoolId, arr);
    }
    for (const b of allBorrowingsList) {
      if (!schoolIds.has(b.schoolId)) continue;
      const arr = borrowingsBySchool.get(b.schoolId) ?? [];
      arr.push(b);
      borrowingsBySchool.set(b.schoolId, arr);
    }
    for (const f of allFeatures) {
      if (!schoolIds.has(f.schoolId)) continue;
      const arr = featuresBySchool.get(f.schoolId) ?? [];
      arr.push(f);
      featuresBySchool.set(f.schoolId, arr);
    }

    const now = Date.now();
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
      const studentCount = studentsBySchool.get(school._id) ?? 0;
      const bookCount = booksBySchool.get(school._id) ?? 0;
      const active = activeBySchool.get(school._id) ?? ([] as typeof allActiveBorrowings);
      const schoolBorrowings = borrowingsBySchool.get(school._id) ?? ([] as typeof allBorrowingsList);
      const features = featuresBySchool.get(school._id) ?? ([] as typeof allFeatures);

      const overdue = active.filter((b) => b.dueDate < now);
      const featuresEnabled = features.filter((f) => f.isEnabled).length;
      const featureAdoption = features.length > 0 ? featuresEnabled / features.length : 0;

      const engagement = studentCount > 0
        ? new Set(schoolBorrowings.map((b) => b.studentId)).size / studentCount
        : 0;

      const overdueRate = active.length > 0 ? overdue.length / active.length : 0;

      const healthScore = Math.round(
        Math.min(100, engagement * 40 + (1 - overdueRate) * 30 + featureAdoption * 20 + 10)
      );

      results.push({
        schoolId: school._id,
        schoolName: school.name,
        studentCount,
        bookCount,
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

    const [students, books, active, allBorrowings, fines, features] = await Promise.all([
      ctx.db.query("students").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(10000),
      ctx.db.query("books").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(10000),
      ctx.db.query("borrowings").withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "borrowed")).take(10000),
      ctx.db.query("borrowings").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(10000),
      ctx.db.query("fines").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(10000),
      ctx.db.query("feature_configurations").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(100),
    ]);

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

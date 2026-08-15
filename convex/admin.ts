import { v } from "convex/values";
import { action, query, mutation } from "./_generated/server";
import { createClerkOrg, updateClerkOrg, deleteClerkOrg } from "./clerk";
import { api, internal } from "./_generated/api";
import { requireSuperadmin, logAuditEntry } from "./helpers";

/** Helper: log a superadmin action to platform_audit_logs */
async function logPlatformAction(
  ctx: { auth: { getUserIdentity: () => Promise<unknown> }; runMutation: (fn: any, args: any) => Promise<any> },
  action: string,
  details?: Record<string, unknown>,
  targetSchoolId?: string,
  targetSchoolName?: string,
  reason?: string,
) {
  const identity = await ctx.auth.getUserIdentity();
  await ctx.runMutation(api.platformAudit.logAction, {
    action,
    details,
    targetSchoolId: targetSchoolId as any,
    targetSchoolName,
    reason,
  });
}

// ── Tier → Paystack Plan Code Mapping ──────────────────────────
const TIER_PLAN_CODES: Record<string, string> = {
  starter: "PLN_9lht8pmsig1o0k0",
  professional: "PLN_ffbdecahyg5nvhd",
  enterprise: "PLN_yei92stozyskpyj",
};

// Fallback amounts (used if Paystack API is unreachable)
const TIER_FALLBACK_AMOUNTS: Record<string, number> = {
  starter: 7000,
  professional: 22000,
  enterprise: 175000,
};

// Note: Live prices are fetched by the billing page and admin tiers UI.
// The plan codes here are used for subscription assignment.
// Amounts are determined by Paystack at checkout time.

/**
 * Superadmin check for actions.
 * Checks JWT metadata first, then falls back to the admins table.
 */
async function requireSuperadminAction(ctx: {
  auth: { getUserIdentity: () => Promise<unknown> };
  runQuery: (fn: any, args: any) => Promise<any>;
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  // Check JWT metadata first
  const meta = (identity as Record<string, unknown>)["publicMetadata"] ??
    (identity as Record<string, unknown>)["public_metadata"];
  if ((meta as { role?: string })?.role === "superadmin") return;

  // Fallback: check admins table
  const admin = await ctx.runQuery(internal.admins.getByUserIdInternal, {
    userId: (identity as { subject: string }).subject,
  });
  if (admin?.role === "superadmin") return;

  throw new Error("Not authorized");
}

// ── Tier Distribution (superadmin only) ─────────────────────────

export const getTierDistribution = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);

    const subscriptions = await ctx.db.query("subscriptions").take(5000);
    const schools = await ctx.db.query("schools").take(5000);

    // Build school name map
    const schoolMap = new Map(schools.map((s) => [s._id, s.name]));

    // Tier counts
    const tierCounts = { starter: 0, professional: 0, enterprise: 0, unassigned: 0 };
    const statusCounts = { active: 0, trial: 0, expired: 0, cancelled: 0, past_due: 0 };
    const tierRevenue = { starter: 0, professional: 0, enterprise: 0 };

    const tierPrices: Record<string, number> = {
      starter: 7000,
      professional: 22000,
      enterprise: 175000,
    };

    const schoolDetails: Array<{
      schoolId: string;
      schoolName: string;
      tier: string | null;
      overriddenTier: string | null;
      effectiveTier: string | null;
      tierScore: number | null;
      status: string;
      planType: string;
      amount: number | null;
      lastPaymentAt: number | null;
      trialEndsAt: number | null;
      overrideReason: string | null;
      overriddenAt: number | null;
    }> = [];

    for (const sub of subscriptions) {
      const tier = sub.recommendedTier ?? null;
      const overriddenTier = sub.overriddenTier ?? null;
      // Effective tier: override takes precedence over AI recommendation
      const effectiveTier = overriddenTier ?? tier;
      const schoolName = schoolMap.get(sub.schoolId) ?? "Unknown School";

      if (effectiveTier && effectiveTier in tierCounts) {
        tierCounts[effectiveTier as keyof typeof tierCounts]++;
        // Projected monthly revenue from this tier
        if (sub.status === "active") {
          tierRevenue[effectiveTier as keyof typeof tierRevenue] += tierPrices[effectiveTier] ?? 0;
        }
      } else {
        tierCounts.unassigned++;
      }

      if (sub.status in statusCounts) {
        statusCounts[sub.status as keyof typeof statusCounts]++;
      }

      schoolDetails.push({
        schoolId: sub.schoolId,
        schoolName,
        tier,
        overriddenTier,
        effectiveTier,
        tierScore: sub.tierScore ?? null,
        status: sub.status,
        planType: sub.planType,
        amount: sub.amount ?? null,
        lastPaymentAt: sub.lastPaymentAt ?? null,
        trialEndsAt: sub.trialEndsAt ?? null,
        overrideReason: sub.overrideReason ?? null,
        overriddenAt: sub.overriddenAt ?? null,
      });
    }

    // Schools with no subscription at all
    const schoolsWithSub = new Set(subscriptions.map((s) => s.schoolId));
    for (const school of schools) {
      if (!schoolsWithSub.has(school._id)) {
        tierCounts.unassigned++;
        schoolDetails.push({
          schoolId: school._id,
          schoolName: school.name,
          tier: null,
          overriddenTier: null,
          effectiveTier: null,
          tierScore: null,
          status: "no_subscription",
          planType: "none",
          amount: null,
          lastPaymentAt: null,
          trialEndsAt: null,
          overrideReason: null,
          overriddenAt: null,
        });
      }
    }

    const totalProjectedRevenue = tierRevenue.starter + tierRevenue.professional + tierRevenue.enterprise;

    return {
      totalSchools: schools.length,
      totalSubscriptions: subscriptions.length,
      tierCounts,
      statusCounts,
      tierRevenue,
      totalProjectedRevenue,
      schools: schoolDetails,
    };
  },
});

// ── Tier Trends (superadmin only) ──────────────────────────────

export const getTierTrends = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);

    const history = await ctx.db.query("tier_history").order("desc").take(500);
    const schools = await ctx.db.query("schools").take(5000);
    const schoolMap = new Map(schools.map((s) => [s._id, s.name]));

    // Group by day for the last 30 days
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Daily tier counts (for trend chart)
    const dailyTrends: Record<string, { date: string; starter: number; professional: number; enterprise: number; total: number }> = {};

    // Initialize last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0];
      dailyTrends[key] = { date: key, starter: 0, professional: 0, enterprise: 0, total: 0 };
    }

    // Count changes per day
    for (const entry of history) {
      const d = new Date(entry._creationTime);
      const key = d.toISOString().split("T")[0];
      if (dailyTrends[key]) {
        const tier = entry.newTier as keyof typeof dailyTrends[string];
        if (tier in dailyTrends[key] && tier !== "date" && tier !== "total") {
          dailyTrends[key][tier]++;
        }
        dailyTrends[key].total++;
      }
    }

    const trendData = Object.values(dailyTrends).sort((a, b) => a.date.localeCompare(b.date));

    // Change type breakdown
    const changeTypeCounts = {
      ai_assigned: 0,
      superadmin_override: 0,
      override_cleared: 0,
      tier_change: 0,
    };
    for (const entry of history) {
      if (entry.changeType in changeTypeCounts) {
        changeTypeCounts[entry.changeType as keyof typeof changeTypeCounts]++;
      }
    }

    // Recent changes (last 20)
    const recentChanges = history.slice(0, 20).map((entry) => ({
      id: entry._id,
      schoolId: entry.schoolId,
      schoolName: schoolMap.get(entry.schoolId) ?? "Unknown",
      previousTier: entry.previousTier ?? null,
      newTier: entry.newTier,
      changeType: entry.changeType,
      reason: entry.reason ?? null,
      changedBy: entry.changedBy ?? null,
      score: entry.score ?? null,
      timestamp: entry._creationTime,
    }));

    // Tier movement summary (upgrades vs downgrades)
    let upgrades = 0;
    let downgrades = 0;
    const tierOrder = { starter: 0, professional: 1, enterprise: 2 };
    for (const entry of history) {
      if (entry.previousTier && entry.newTier) {
        const prev = tierOrder[entry.previousTier as keyof typeof tierOrder] ?? -1;
        const next = tierOrder[entry.newTier as keyof typeof tierOrder] ?? -1;
        if (prev >= 0 && next >= 0) {
          if (next > prev) upgrades++;
          else if (next < prev) downgrades++;
        }
      }
    }

    return {
      trendData,
      changeTypeCounts,
      recentChanges,
      upgrades,
      downgrades,
      totalChanges: history.length,
    };
  },
});

// ── Override History (superadmin only) ──────────────────────────

export const getOverrideHistory = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);

    // Get only override-related changes
    const allHistory = await ctx.db.query("tier_history").order("desc").take(1000);
    const overrideHistory = allHistory.filter(
      (h) => h.changeType === "superadmin_override" || h.changeType === "override_cleared"
    );

    const schools = await ctx.db.query("schools").take(5000);
    const schoolMap = new Map(schools.map((s) => [s._id, s.name]));

    // Stats
    const totalOverrides = overrideHistory.filter((h) => h.changeType === "superadmin_override").length;
    const totalCleared = overrideHistory.filter((h) => h.changeType === "override_cleared").length;

    // By school
    const bySchool: Record<string, { schoolName: string; overrides: number; cleared: number; lastOverride: number | null }> = {};
    for (const entry of overrideHistory) {
      const schoolName = schoolMap.get(entry.schoolId) ?? "Unknown";
      if (!bySchool[entry.schoolId]) {
        bySchool[entry.schoolId] = { schoolName, overrides: 0, cleared: 0, lastOverride: null };
      }
      if (entry.changeType === "superadmin_override") {
        bySchool[entry.schoolId].overrides++;
        if (!bySchool[entry.schoolId].lastOverride || entry._creationTime > bySchool[entry.schoolId].lastOverride!) {
          bySchool[entry.schoolId].lastOverride = entry._creationTime;
        }
      } else {
        bySchool[entry.schoolId].cleared++;
      }
    }

    const schoolSummaries = Object.entries(bySchool)
      .map(([schoolId, data]) => ({ schoolId, ...data }))
      .sort((a, b) => (b.lastOverride ?? 0) - (a.lastOverride ?? 0));

    // Detailed history entries
    const entries = overrideHistory.slice(0, 100).map((entry) => ({
      id: entry._id,
      schoolId: entry.schoolId,
      schoolName: schoolMap.get(entry.schoolId) ?? "Unknown",
      previousTier: entry.previousTier ?? null,
      newTier: entry.newTier,
      changeType: entry.changeType,
      reason: entry.reason ?? null,
      changedBy: entry.changedBy ?? null,
      score: entry.score ?? null,
      timestamp: entry._creationTime,
    }));

    return {
      totalOverrides,
      totalCleared,
      schoolSummaries,
      entries,
    };
  },
});

// ── Override Tier (superadmin only) ──────────────────────────────

export const overrideTier = mutation({
  args: {
    schoolId: v.id("schools"),
    tier: v.union(
      v.literal("starter"),
      v.literal("professional"),
      v.literal("enterprise"),
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireSuperadmin(ctx);

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .first();

    const planCode = TIER_PLAN_CODES[args.tier];
    // Note: amount is 0 for new subs, fetched live by the billing page on checkout

    if (!sub) {
      // Create a subscription with the override
      const now = Date.now();
      await ctx.db.insert("subscriptions", {
        schoolId: args.schoolId,
        planType: args.tier,
        status: "trial",
        overriddenTier: args.tier,
        overriddenAt: now,
        overriddenBy: admin.userId,
        overrideReason: args.reason,
        assignedPlanCode: planCode,
        trialStartedAt: now,
        trialEndsAt: now + 7 * 24 * 60 * 60 * 1000,
        currency: "KES",
        amount: 0,
      });
    } else {
      await ctx.db.patch(sub._id, {
        overriddenTier: args.tier,
        overriddenAt: Date.now(),
        overriddenBy: admin.userId,
        overrideReason: args.reason,
        assignedPlanCode: planCode,
        planType: args.tier,
        // amount will be set when user actually subscribes via Paystack
      });
    }

    await logAuditEntry(ctx, args.schoolId, "subscription.tier_overridden", {
      tier: args.tier,
      previousTier: sub?.recommendedTier ?? sub?.overriddenTier ?? null,
      reason: args.reason,
      overriddenBy: admin.userId,
    });

    // Log to tier_history
    await ctx.db.insert("tier_history", {
      schoolId: args.schoolId,
      previousTier: sub?.overriddenTier ?? sub?.recommendedTier ?? undefined,
      newTier: args.tier,
      changeType: "superadmin_override",
      reason: args.reason,
      changedBy: admin.userId,
      score: sub?.tierScore ?? undefined,
    });

    // Log to platform audit
    const schoolName = (await ctx.db.get(args.schoolId))?.name ?? "Unknown";
    await ctx.db.insert("platform_audit_logs", {
      adminUserId: admin.userId,
      adminEmail: admin.email,
      targetSchoolId: args.schoolId,
      targetSchoolName: schoolName,
      action: "tier.override",
      details: { tier: args.tier, previousTier: sub?.overriddenTier ?? sub?.recommendedTier ?? null },
      reason: args.reason,
      timestamp: Date.now(),
    });

    return { ok: true };
  },
});

// ── Clear Tier Override (revert to AI recommendation) ────────────

export const clearTierOverride = mutation({
  args: {
    schoolId: v.id("schools"),
  },
  handler: async (ctx, args) => {
    const admin = await requireSuperadmin(ctx);

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .first();

    if (sub && sub.overriddenTier) {
      const previousOverride = sub.overriddenTier;
      // Revert to AI-assigned tier's plan code
      const aiPlanCode = sub.recommendedTier ? TIER_PLAN_CODES[sub.recommendedTier] : undefined;
      await ctx.db.patch(sub._id, {
        overriddenTier: undefined,
        overriddenAt: undefined,
        overriddenBy: undefined,
        overrideReason: undefined,
        assignedPlanCode: aiPlanCode ?? sub.assignedPlanCode,
        planType: sub.recommendedTier ?? sub.planType,
        // amount stays as-is; will be updated on next payment
      });

      await logAuditEntry(ctx, args.schoolId, "subscription.tier_override_cleared", {
        previousOverride,
        clearedBy: admin.userId,
      });

      // Log to tier_history
      await ctx.db.insert("tier_history", {
        schoolId: args.schoolId,
        previousTier: previousOverride,
        newTier: sub.recommendedTier ?? "unassigned",
        changeType: "override_cleared",
        reason: `Override cleared by superadmin, reverted to AI: ${sub.recommendedTier ?? "none"}`,
        changedBy: admin.userId,
      });

      // Log to platform audit
      const schoolName = (await ctx.db.get(args.schoolId))?.name ?? "Unknown";
      await ctx.db.insert("platform_audit_logs", {
        adminUserId: admin.userId,
        adminEmail: admin.email,
        targetSchoolId: args.schoolId,
        targetSchoolName: schoolName,
        action: "tier.override_cleared",
        details: { previousOverride, revertedTo: sub.recommendedTier ?? "none" },
        timestamp: Date.now(),
      });
    }

    return { ok: true };
  },
});

// Create school + create Clerk organisation.
export const create = action({
  args: {
    name: v.string(),
    slug: v.string(),
    books: v.optional(
      v.array(
        v.object({
          title: v.string(),
          author: v.string(),
          availableCopies: v.number(),
          totalCopies: v.optional(v.number()),
          isbn: v.optional(v.string()),
          subject: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, { name, slug, books }) => {
    await requireSuperadminAction(ctx);
    const org = await createClerkOrg(name);
    const schoolId = await ctx.runMutation(api.schools.create, {
      clerkOrgId: org.id,
      name,
      slug,
      primaryColor: "#2563eb",
      secondaryColor: "#64748b",
    });

    let bookCount = 0;
    if (books && books.length > 0) {
      const result = await ctx.runMutation(api.books.bulkCreate, {
        schoolId,
        books,
      });
      bookCount = result.count;
    }

    await logPlatformAction(ctx, "school.create", { name, slug, bookCount }, schoolId, name);
    return { clerkOrgId: org.id, bookCount };
  },
});

// Update school + sync name to Clerk org.
export const update = action({
  args: {
    id: v.id("schools"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    clerkOrgId: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("trial"),
    )),
  },
  handler: async (ctx, { id, ...updates }) => {
    await requireSuperadminAction(ctx);
    const school = await ctx.runQuery(internal.schools.getById, { id });
    if (!school) throw new Error("School not found");

    if (updates.name && updates.name !== school.name) {
      await updateClerkOrg(school.clerkOrgId, { name: updates.name });
    }

    await ctx.runMutation(api.schools.update, { id, ...updates });
    await logPlatformAction(ctx, "school.update", { id, ...updates }, id, school.name);
  },
});

// Delete school + delete Clerk organisation.
export const remove = action({
  args: { id: v.id("schools") },
  handler: async (ctx, { id }) => {
    await requireSuperadminAction(ctx);
    const school = await ctx.runQuery(internal.schools.getById, { id });
    if (!school) throw new Error("School not found");

    await deleteClerkOrg(school.clerkOrgId);
    await ctx.runMutation(api.schools.remove, { id, force: true });
    await logPlatformAction(ctx, "school.delete", { id, name: school.name, force: true }, id, school.name);
  },
});
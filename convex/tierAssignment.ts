/**
 * Tier Assignment Module
 *
 * Analyzes onboarding answers using combined scoring to recommend a
 * Paystack plan tier (Starter / Professional / Enterprise).
 *
 * Scoring weights:
 *   - Student headcount:  30%
 *   - Module richness:    25%
 *   - Facility breadth:   20%
 *   - Fee level:          15%
 *   - Boarding status:    10%
 *
 * The score (0–100) maps to a tier:
 *   0–39  → Starter       (KES 7,000/mo)
 *   40–74 → Professional  (KES 22,000/mo)
 *   75–100 → Enterprise   (KES 175,000/mo)
 */

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ── Tier Definitions ─────────────────────────────────────────────

export const TIERS = {
  starter: {
    name: "Starter",
    planCode: "PLN_9lht8pmsig1o0k0",
    amount: 7000,
    currency: "KES",
    interval: "monthly",
    description: "For small schools getting started with digital management",
    maxStudents: 200,
    features: [
      "Up to 200 students",
      "Core modules (Attendance, Exams, Library)",
      "Basic reporting",
      "Email support",
    ],
  },
  professional: {
    name: "Professional",
    planCode: "PLN_ffbdecahyg5nvhd",
    amount: 22000,
    currency: "KES",
    interval: "monthly",
    description: "For growing schools that need comprehensive management",
    maxStudents: 1000,
    features: [
      "Up to 1,000 students",
      "All modules enabled",
      "Advanced reporting & analytics",
      "Priority support",
      "Parent portal",
      "CBC curriculum support",
    ],
  },
  enterprise: {
    name: "Enterprise",
    planCode: "PLN_yei92stozyskpyj",
    amount: 175000,
    currency: "KES",
    interval: "monthly",
    description: "For large institutions needing full-scale management",
    maxStudents: Infinity,
    features: [
      "Unlimited students",
      "All modules + custom roles",
      "Full analytics suite",
      "Dedicated support",
      "API access",
      "Custom integrations",
      "Multi-campus support",
    ],
  },
} as const;

export type TierName = keyof typeof TIERS;

// ── Scoring Weights ──────────────────────────────────────────────

const WEIGHTS = {
  headcount: 0.30,
  modules: 0.25,
  facilities: 0.20,
  fees: 0.15,
  boarding: 0.10,
} as const;

// ── Scoring Functions ────────────────────────────────────────────

/** Score student headcount (0–100) */
function scoreHeadcount(data: OnboardingData): number {
  const n = parseInt(data.headcountLearners || "0", 10);
  if (n <= 0) return 5; // No data yet — low default
  if (n < 50) return 15;
  if (n < 100) return 30;
  if (n < 200) return 45;
  if (n < 500) return 65;
  if (n < 1000) return 80;
  if (n < 3000) return 90;
  return 100;
}

/** Score module richness (0–100) — what percentage of modules are enabled */
function scoreModules(data: OnboardingData): number {
  const allModules = [
    "health", "discipline", "extracurricular",
    "lessonPlanning", "dutyRoster", "staffAttendance", "hr", "parentMeetings",
    "medical", "transport", "gateLog", "maintenance", "bookHolds",
    "admissions", "expenditures", "correspondence", "appointments",
  ];
  const enabled = allModules.filter((m) => data.enabledModules?.[m]).length;
  const ratio = enabled / allModules.length;
  return Math.round(ratio * 100);
}

/** Score facility breadth (0–100) */
function scoreFacilities(data: OnboardingData): number {
  const allFacilities = ["boarding", "transport", "library", "scienceLabs", "clinic", "computerLab", "sports"];
  const enabled = allFacilities.filter((f) => data.facilities?.[f]).length;
  const ratio = enabled / allFacilities.length;
  return Math.round(ratio * 100);
}

/** Score fee level (0–100) — higher fees suggest larger/more resourced school */
function scoreFees(data: OnboardingData): number {
  const fee = parseInt(data.feePerStudent || "0", 10);
  if (fee <= 0) return 10;
  if (fee < 5000) return 20;
  if (fee < 10000) return 40;
  if (fee < 20000) return 60;
  if (fee < 50000) return 80;
  return 100;
}

/** Score boarding status (0–100) */
function scoreBoarding(data: OnboardingData): number {
  return data.isBoarding ? 100 : 20;
}

// ── Onboarding Data Interface ────────────────────────────────────

interface OnboardingData {
  schoolName?: string;
  schoolType?: string;
  isBoarding?: boolean;
  termsPerYear?: number;
  feePerStudent?: string;
  feeFrequency?: string;
  facilities?: Record<string, boolean>;
  headcountLearners?: string;
  headcountStaff?: string;
  recordsManagement?: string;
  setupRoute?: string;
  enabledModules?: Record<string, boolean>;
  enableParentPortal?: boolean;
  enabledNotifications?: Record<string, boolean>;
  [key: string]: unknown;
}

// ── Combined Scoring ─────────────────────────────────────────────

function computeCombinedScore(data: OnboardingData): {
  score: number;
  breakdown: Record<string, { raw: number; weighted: number }>;
} {
  const headcountRaw = scoreHeadcount(data);
  const modulesRaw = scoreModules(data);
  const facilitiesRaw = scoreFacilities(data);
  const feesRaw = scoreFees(data);
  const boardingRaw = scoreBoarding(data);

  const breakdown = {
    headcount: { raw: headcountRaw, weighted: headcountRaw * WEIGHTS.headcount },
    modules: { raw: modulesRaw, weighted: modulesRaw * WEIGHTS.modules },
    facilities: { raw: facilitiesRaw, weighted: facilitiesRaw * WEIGHTS.facilities },
    fees: { raw: feesRaw, weighted: feesRaw * WEIGHTS.fees },
    boarding: { raw: boardingRaw, weighted: boardingRaw * WEIGHTS.boarding },
  };

  const score = Math.round(
    breakdown.headcount.weighted +
    breakdown.modules.weighted +
    breakdown.facilities.weighted +
    breakdown.fees.weighted +
    breakdown.boarding.weighted
  );

  return { score: Math.min(100, Math.max(0, score)), breakdown };
}

/** Map a score (0–100) to a tier name */
function scoreToTier(score: number): TierName {
  if (score >= 75) return "enterprise";
  if (score >= 40) return "professional";
  return "starter";
}

/** Generate a human-readable analysis summary */
function generateAnalysis(
  data: OnboardingData,
  score: number,
  tier: TierName,
  breakdown: Record<string, { raw: number; weighted: number }>
): string {
  const tierInfo = TIERS[tier];
  const lines: string[] = [];

  lines.push(`Based on your school's profile, we recommend the **${tierInfo.name}** plan (KES ${tierInfo.amount.toLocaleString()}/month).`);
  lines.push("");
  lines.push("**Scoring breakdown:**");
  lines.push(`- Student headcount (${Math.round(WEIGHTS.headcount * 100)}%): ${breakdown.headcount.raw}/100`);
  lines.push(`- Module richness (${Math.round(WEIGHTS.modules * 100)}%): ${breakdown.modules.raw}/100`);
  lines.push(`- Facility breadth (${Math.round(WEIGHTS.facilities * 100)}%): ${breakdown.facilities.raw}/100`);
  lines.push(`- Fee level (${Math.round(WEIGHTS.fees * 100)}%): ${breakdown.fees.raw}/100`);
  lines.push(`- Boarding status (${Math.round(WEIGHTS.boarding * 100)}%): ${breakdown.boarding.raw}/100`);
  lines.push("");
  lines.push(`**Overall score: ${score}/100**`);

  if (tier === "starter") {
    lines.push("");
    lines.push("Your school profile suggests the Starter plan covers your needs. As you grow, you can upgrade to Professional or Enterprise.");
  } else if (tier === "professional") {
    lines.push("");
    lines.push("Your school has significant operational needs that the Professional plan addresses. This includes all modules, advanced reporting, and priority support.");
  } else {
    lines.push("");
    lines.push("Your large-scale operations warrant the Enterprise plan with unlimited students, custom integrations, and dedicated support.");
  }

  return lines.join("\n");
}

// ── Internal helpers (called from mutations) ─────────────────────

export const getTierConfig = internalQuery({
  args: {},
  handler: async () => {
    return TIERS;
  },
});

export const saveTierRecommendation = internalMutation({
  args: {
    schoolId: v.id("schools"),
    sessionId: v.id("onboarding_sessions"),
    tier: v.union(v.literal("starter"), v.literal("professional"), v.literal("enterprise")),
    score: v.number(),
    analysis: v.string(),
    planCode: v.string(),
  },
  handler: async (ctx, args) => {
    // Update the onboarding session
    await ctx.db.patch(args.sessionId, {
      recommendedTier: args.tier,
      tierScore: args.score,
      tierAnalysis: args.analysis,
      tierAssignedAt: Date.now(),
    });

    // Update or create the subscription with the recommendation
    const existingSub = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .first();

    if (existingSub) {
      await ctx.db.patch(existingSub._id, {
        recommendedTier: args.tier,
        tierScore: args.score,
        tierAnalysis: args.analysis,
        tierAssignedAt: Date.now(),
        assignedPlanCode: args.planCode,
      });
    } else {
      const now = Date.now();
      await ctx.db.insert("subscriptions", {
        schoolId: args.schoolId,
        planType: args.tier,
        status: "trial",
        recommendedTier: args.tier,
        tierScore: args.score,
        tierAnalysis: args.analysis,
        tierAssignedAt: now,
        assignedPlanCode: args.planCode,
        trialStartedAt: now,
        trialEndsAt: now + 7 * 24 * 60 * 60 * 1000,
        currency: "KES",
        amount: 0,
      });
    }

    // Log to tier_history
    await ctx.db.insert("tier_history", {
      schoolId: args.schoolId,
      previousTier: undefined,
      newTier: args.tier,
      changeType: "ai_assigned",
      reason: "AI tier assignment during onboarding",
      changedBy: "system",
      score: args.score,
    });

    return { ok: true };
  },
});

// ── Main Action: Analyze onboarding and assign tier ──────────────

export const analyzeAndAssignTier = action({
  args: {
    schoolId: v.id("schools"),
  },
  handler: async (ctx, args) => {
    // 1. Get the onboarding session
    const session = await ctx.runQuery(internal.tierAssignment._getSession, {
      schoolId: args.schoolId,
    });
    if (!session) throw new Error("No onboarding session found");
    if (!session.collectedAnswers) throw new Error("No onboarding answers to analyze");

    const data = session.collectedAnswers as OnboardingData;

    // 2. Compute combined score
    const { score, breakdown } = computeCombinedScore(data);

    // 3. Determine tier
    const tier = scoreToTier(score);
    const tierConfig = TIERS[tier];

    // 4. Generate analysis text
    const analysis = generateAnalysis(data, score, tier, breakdown);

    // 5. Save to database
    await ctx.runMutation(internal.tierAssignment.saveTierRecommendation, {
      schoolId: args.schoolId,
      sessionId: session._id,
      tier,
      score,
      analysis,
      planCode: tierConfig.planCode,
    });

    return {
      tier,
      tierName: tierConfig.name,
      score,
      planCode: tierConfig.planCode,
      amount: tierConfig.amount,
      currency: tierConfig.currency,
      analysis,
      breakdown,
    };
  },
});

// ── Internal query: get session (not exposed to client) ──────────

export const _getSession = internalQuery({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    return await ctx.db
      .query("onboarding_sessions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
  },
});

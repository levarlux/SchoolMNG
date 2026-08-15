import { v } from "convex/values";
import { query, mutation, action, internalQuery, internalMutation } from "./_generated/server";
import { requireSchoolFromJwt, logAuditEntry } from "./helpers";
import { api, internal } from "./_generated/api";

// ── Constants ────────────────────────────────────────────────────

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CHECKOUT_ATTEMPTS = 5;
const CHECKOUT_COOLDOWN_MS = 60 * 1000; // 1 minute
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 5000;

// ── Types ────────────────────────────────────────────────────────

type SubscriptionPlan = {
  name: string;
  amount: number;
  currency: string;
  interval: string;
  trialDays: number;
  planCode: string | null;
  features: string[];
};

// ── Get current subscription (server-side only) ──────────────────

export const getMySubscription = query({
  args: {},
  handler: async (ctx) => {
    try {
      const school = await requireSchoolFromJwt(ctx);
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
        .first();

      if (!sub) return null;

      const now = Date.now();
      const isTrialActive = sub.status === "trial" && sub.trialEndsAt !== undefined && sub.trialEndsAt > now;
      const isCancelledButActive = sub.status === "cancelled" && sub.nextBillingDate !== undefined && sub.nextBillingDate > now;
      const trialDaysRemaining = sub.trialEndsAt
        ? Math.max(0, Math.ceil((sub.trialEndsAt - now) / (24 * 60 * 60 * 1000)))
        : 0;

      // Only return safe fields to frontend
      return {
        _id: sub._id,
        status: sub.status,
        isTrialActive,
        isCancelledButActive,
        trialDaysRemaining,
        isActive: sub.status === "active" || isTrialActive || isCancelledButActive,
        trialStartedAt: sub.trialStartedAt,
        nextBillingDate: sub.nextBillingDate,
        lastPaymentAt: sub.lastPaymentAt,
        cancelledAt: sub.cancelledAt,
        currency: sub.currency,
        amount: sub.amount,
        planCode: sub.assignedPlanCode ?? null,
      };
    } catch {
      return null;
    }
  },
});

// ── Billing history (payments & invoices, from the webhook ledger) ─

export const getBillingHistory = query({
  args: {},
  handler: async (ctx) => {
    try {
      const school = await requireSchoolFromJwt(ctx);
      const events = await ctx.db
        .query("webhook_events")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
        .take(200);

      return events
        .filter((e) => e.event === "charge.success" || e.event === "invoice.create")
        .map((e) => ({
          event: e.event,
          reference: e.reference ?? "—",
          amount: e.amount !== undefined ? e.amount / 100 : null,
          status: (e.event === "charge.success" ? "paid" : "pending") as
            | "paid"
            | "pending",
          date: e.processedAt,
        }))
        .sort((a, b) => b.date - a.date)
        .slice(0, 20);
    } catch {
      return [];
    }
  },
});

// ── Access control check (server-side, cannot be bypassed) ───────

export const hasAccess = query({
  args: {},
  handler: async (ctx) => {
    try {
      const school = await requireSchoolFromJwt(ctx);
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
        .first();

      if (!sub) return { hasAccess: false, reason: "no_subscription" as const };

      const now = Date.now();

      // Active subscription
      if (sub.status === "active") {
        // Check if subscription hasn't expired (nextBillingDate check)
        if (sub.nextBillingDate && sub.nextBillingDate < now) {
          return { hasAccess: false, reason: "subscription_expired" as const };
        }
        return { hasAccess: true, reason: "active" as const };
      }

      // Cancelled but still within the paid period — access continues
      // until nextBillingDate (matches the Paystack behaviour where
      // disabling a subscription keeps it active until the period ends).
      if (
        sub.status === "cancelled" &&
        sub.nextBillingDate &&
        sub.nextBillingDate > now
      ) {
        return { hasAccess: true, reason: "active_until_period_end" as const };
      }

      // Trial still running
      if (sub.status === "trial" && sub.trialEndsAt && sub.trialEndsAt > now) {
        return { hasAccess: true, reason: "trial" as const, trialEndsAt: sub.trialEndsAt };
      }

      // Trial expired or subscription inactive
      return { hasAccess: false, reason: sub.status as string };
    } catch {
      return { hasAccess: false, reason: "not_authenticated" as const };
    }
  },
});

// ── Ensure trial exists (server-side, with rate limiting) ────────

export const ensureTrialSubscription = mutation({
  args: {},
  handler: async (ctx) => {
    try {
      const school = await requireSchoolFromJwt(ctx);

      const existing = await ctx.db
        .query("subscriptions")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
        .first();

      if (existing) return existing;

      // Create a new trial subscription
      const now = Date.now();
      const subId = await ctx.db.insert("subscriptions", {
        schoolId: school._id,
        planType: "monthly",
        status: "trial",
        trialStartedAt: now,
        trialEndsAt: now + TRIAL_DURATION_MS,
        currency: "KES",
        amount: 0, // Will be updated when subscription is activated
      });

      await logAuditEntry(ctx, school._id, "subscription.trial_created", {
        subscriptionId: subId,
        trialEndsAt: now + TRIAL_DURATION_MS,
      });

      return await ctx.db.get(subId);
    } catch {
      // School gone or no active organisation (e.g. account just deleted).
      // Return null so the client stops auto-creating trials.
      return null;
    }
  },
});

// ── Extend trial (development-only convenience) ──────────────────

/**
 * DEV-ONLY: extends the caller's trial by one year so development flows
 * can skip the payment step. The UI only exposes this on localhost; keep
 * it harmless in production (a year's trial is still a valid trial).
 */
export const extendTrialForDevelopment = mutation({
  args: {},
  handler: async (ctx) => {
    const school = await requireSchoolFromJwt(ctx);
    const now = Date.now();
    const trialEndsAt = now + 365 * 24 * 60 * 60 * 1000;

    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "trial",
        trialStartedAt: now,
        trialEndsAt,
      });
    } else {
      await ctx.db.insert("subscriptions", {
        schoolId: school._id,
        planType: "monthly",
        status: "trial",
        trialStartedAt: now,
        trialEndsAt,
        currency: "KES",
        amount: 0,
      });
    }

    await logAuditEntry(ctx, school._id, "subscription.dev_trial_extended", {
      trialEndsAt,
    });
    return { ok: true, trialEndsAt };
  },
});

// ── Cancel subscription (user-initiated, calls Paystack API) ─────

export const cancelSubscription = action({
  args: {},
  handler: async (ctx) => {
    const school = await ctx.runQuery(api.schools.getMySchool);
    if (!school) throw new Error("Unauthorized");

    const sub = await ctx.runQuery(api.billing.getMySubscription);
    if (!sub) throw new Error("No subscription found");

    // Get full subscription details via the subscriptions module
    const fullSub = await ctx.runQuery(api.subscriptions.getBySchoolForUser, {
      schoolId: school._id,
    });

    if (!fullSub) throw new Error("No subscription found");

    // If there's a Paystack subscription code, disable it via API with retry
    if (fullSub.paystackSubscriptionCode) {
      const secret = process.env.PAYSTACK_SECRET_KEY;
      if (!secret) throw new Error("PAYSTACK_SECRET_KEY not set");

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
          await fetch(`https://api.paystack.co/subscription/${fullSub.paystackSubscriptionCode}/disable`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${secret}`,
            },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          break; // Success, exit retry loop
        } catch (err) {
          const isAbortError = err instanceof Error && err.name === "AbortError";
          const isNetworkError = err instanceof TypeError && err.message.includes("fetch");
          const isRetryable = isAbortError || isNetworkError;
          
          if (isRetryable && attempt < MAX_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
            console.warn(`[billing] Cancel attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          // Non-retryable error or final attempt - log and continue with local cancellation
          console.error("[billing] Failed to disable Paystack subscription:", err);
          break;
        }
      }
    }

    // Update local subscription status via the subscriptions module
    await ctx.runMutation(api.subscriptions.cancelBySchool, {
      schoolId: school._id,
    });

    return { success: true };
  },
});

// ── Internal queries/mutations (NOT exposed to the client) ────────

export const getSubscriptionInternal = internalQuery({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .first();
  },
});

export const updateSubscriptionStatus = internalMutation({
  args: {
    schoolId: v.id("schools"),
    status: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("past_due"),
    ),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .first();

    if (!sub) throw new Error("No subscription found");

    await ctx.db.patch(sub._id, { status: args.status });
    return { success: true };
  },
});

// ── Activate subscription (called by webhook only) ───────────────

export const activateSubscriptionInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    reference: v.string(),
    amount: v.number(),
    paystackCustomerCode: v.optional(v.string()),
    paystackSubscriptionCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .first();

    if (!sub) {
      // Create a new subscription if none exists
      const now = Date.now();
      const subId = await ctx.db.insert("subscriptions", {
        schoolId: args.schoolId,
        planType: "monthly",
        status: "active",
        lastPaymentAt: now,
        nextBillingDate: now + 30 * 24 * 60 * 60 * 1000,
        currency: "KES",
        amount: args.amount,
        paystackCustomerCode: args.paystackCustomerCode,
        paystackSubscriptionCode: args.paystackSubscriptionCode,
      });

      await logAuditEntry(ctx, args.schoolId, "subscription.activated", {
        subscriptionId: subId,
        reference: args.reference,
      });

      return await ctx.db.get(subId);
    }

    const now = Date.now();

    await ctx.db.patch(sub._id, {
      status: "active",
      lastPaymentAt: now,
      nextBillingDate: now + 30 * 24 * 60 * 60 * 1000,
      amount: args.amount,
      paystackCustomerCode: args.paystackCustomerCode ?? sub.paystackCustomerCode,
      paystackSubscriptionCode: args.paystackSubscriptionCode ?? sub.paystackSubscriptionCode,
    });

    await logAuditEntry(ctx, args.schoolId, "subscription.activated", {
      subscriptionId: sub._id,
      reference: args.reference,
    });

    return await ctx.db.get(sub._id);
  },
});

// ── Get plan details (action, fetches from Paystack) ─────────────

export const getSubscriptionPlan = query({
  args: {},
  handler: async (_ctx): Promise<SubscriptionPlan> => {
    // Plan code comes from environment variable
    const planCode = process.env.PAYSTACK_PLAN_ID || null;

    // Default features (these can also be fetched from Paystack if needed)
    const features = [
      "Full access to all modules",
      "Unlimited students, books, and borrowings",
      "CBC curriculum support",
      "Attendance & exam tracking",
      "Timetable management",
      "Reports & analytics",
      "Priority support",
    ];

    return {
      name: "SchoolMNG Monthly",
      amount: 0, // Will be fetched by frontend from Paystack
      currency: "KES",
      interval: "monthly",
      trialDays: 7,
      planCode,
      features,
    };
  },
});

// ── Get all available tier plans (LIVE from Paystack) ───────────

/** Plan metadata — plan codes and features are static; amounts come from Paystack. */
const TIER_PLANS = [
  {
    tier: "starter" as const,
    name: "Starter",
    planCode: "PLN_9lht8pmsig1o0k0",
    fallbackAmount: 7000,
    currency: "KES",
    interval: "monthly",
    description: "For small schools getting started with digital management",
    features: [
      "Up to 200 students",
      "Core modules (Attendance, Exams, Library)",
      "Basic reporting",
      "Email support",
    ],
  },
  {
    tier: "professional" as const,
    name: "Professional",
    planCode: "PLN_ffbdecahyg5nvhd",
    fallbackAmount: 22000,
    currency: "KES",
    interval: "monthly",
    description: "For growing schools that need comprehensive management",
    features: [
      "Up to 1,000 students",
      "All modules enabled",
      "Advanced reporting & analytics",
      "Priority support",
      "Parent portal",
      "CBC curriculum support",
    ],
  },
  {
    tier: "enterprise" as const,
    name: "Enterprise",
    planCode: "PLN_yei92stozyskpyj",
    fallbackAmount: 175000,
    currency: "KES",
    interval: "monthly",
    description: "For large institutions needing full-scale management",
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
];

/** Fetches all live plans from Paystack API (GET /plan) or auto-creates them if missing. */
async function syncPaystackPlans(): Promise<Map<string, { planCode: string; amount: number }>> {
  const planMap = new Map<string, { planCode: string; amount: number }>();
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return planMap;

  // 1. Check environment variables first if specific plan codes are provided
  const envStarter = process.env.PAYSTACK_PLAN_STARTER;
  const envPro = process.env.PAYSTACK_PLAN_PROFESSIONAL;
  const envEnt = process.env.PAYSTACK_PLAN_ENTERPRISE;

  // 2. Fetch list of all existing plans from Paystack
  try {
    const res = await fetch("https://api.paystack.co/plan", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const json = await res.json();
    if (json.status && Array.isArray(json.data)) {
      for (const p of json.data) {
        const name = (p.name || "").toLowerCase();
        const code = p.plan_code;
        const amt = p.amount / 100;

        if (code === envStarter || name.includes("starter") || amt === 7000) {
          if (!planMap.has("starter")) planMap.set("starter", { planCode: code, amount: amt });
        }
        if (code === envPro || name.includes("professional") || amt === 22000) {
          if (!planMap.has("professional")) planMap.set("professional", { planCode: code, amount: amt });
        }
        if (code === envEnt || name.includes("enterprise") || amt === 175000) {
          if (!planMap.has("enterprise")) planMap.set("enterprise", { planCode: code, amount: amt });
        }
      }
    }
  } catch (err) {
    console.warn("[billing] Could not list plans from Paystack:", err);
  }

  // 3. Auto-create any missing plans on Paystack
  const defaultTiers = [
    { tier: "starter", name: "Starter Tier", amount: 7000 },
    { tier: "professional", name: "Professional Tier", amount: 22000 },
    { tier: "enterprise", name: "Enterprise Tier", amount: 175000 },
  ] as const;

  for (const item of defaultTiers) {
    if (!planMap.has(item.tier)) {
      try {
        console.log(`[billing] Auto-creating missing Paystack plan for tier: ${item.tier}`);
        const createRes = await fetch("https://api.paystack.co/plan", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: item.name,
            interval: "monthly",
            amount: item.amount * 100,
            currency: "KES",
            description: `SchoolMNG ${item.name} Monthly Subscription Plan`,
          }),
        });
        const createJson = await createRes.json();
        if (createJson.status && createJson.data) {
          console.log(`[billing] Created Paystack plan: ${createJson.data.plan_code} for ${item.tier}`);
          planMap.set(item.tier, {
            planCode: createJson.data.plan_code,
            amount: createJson.data.amount / 100,
          });
        }
      } catch (err) {
        console.error(`[billing] Failed to auto-create Paystack plan for ${item.tier}:`, err);
      }
    }
  }

  return planMap;
}

/** Fetches live prices and plan codes from Paystack for each plan. Auto-creates plans on Paystack if missing. */
export const getAllTierPlans = action({
  args: {},
  handler: async () => {
    const livePlanMap = await syncPaystackPlans();

    return TIER_PLANS.map((plan) => {
      const live = livePlanMap.get(plan.tier);
      return {
        tier: plan.tier,
        name: plan.name,
        planCode: live?.planCode ?? plan.planCode,
        amount: live?.amount ?? plan.fallbackAmount,
        currency: plan.currency,
        interval: plan.interval,
        description: plan.description,
        features: plan.features,
      };
    });
  },
});

// ── Get the school's recommended tier from onboarding ───────────

export const getRecommendedTier = query({
  args: {},
  handler: async (ctx) => {
    try {
      const school = await requireSchoolFromJwt(ctx);
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
        .first();

      if (!sub) return null;

      return {
        recommendedTier: sub.recommendedTier ?? null,
        tierScore: sub.tierScore ?? null,
        tierAnalysis: sub.tierAnalysis ?? null,
        tierAssignedAt: sub.tierAssignedAt ?? null,
        assignedPlanCode: sub.assignedPlanCode ?? null,
        currentPlanCode: sub.paystackSubscriptionCode ?? null,
      };
    } catch {
      return null;
    }
  },
});

export const fetchPlanDetails = action({
  args: { planCode: v.string() },
  handler: async (ctx, args): Promise<SubscriptionPlan> => {
    try {
      const plan = await ctx.runAction(internal.paystack.getPlanDetails, { planCode: args.planCode });
      return {
        name: plan.name,
        amount: plan.amount,
        currency: plan.currency,
        interval: plan.interval,
        trialDays: 7,
        planCode: plan.planCode,
        features: [
          "Full access to all modules",
          "Unlimited students, books, and borrowings",
          "CBC curriculum support",
          "Attendance & exam tracking",
          "Timetable management",
          "Reports & analytics",
          "Priority support",
        ],
      };
    } catch (err) {
      console.error("[billing] Failed to fetch plan from Paystack:", err);
      throw new Error("Unable to fetch plan details");
    }
  },
});

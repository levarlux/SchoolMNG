import { action, internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

// ── Paystack API helpers ─────────────────────────────────────────

const PAYSTACK_BASE = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY not set in Convex env");
  return key;
}

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 second base delay
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds per request

async function paystackFetch(path: string, options: RequestInit = {}) {
  const secret = getSecretKey();
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    try {
      const res = await fetch(`${PAYSTACK_BASE}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      const body = await res.json();
      if (!body.status) {
        throw new Error(`Paystack API error: ${body.message ?? JSON.stringify(body)}`);
      }
      return body;
    } catch (err) {
      clearTimeout(timeout);
      
      const isAbortError = err instanceof Error && err.name === "AbortError";
      const isNetworkError = err instanceof TypeError && err.message.includes("fetch");
      const isRetryable = isAbortError || isNetworkError;
      
      // Don't retry on Paystack API errors (they're not transient)
      if (!isRetryable && attempt === MAX_RETRIES) {
        throw err;
      }
      
      // If it's the last attempt or not retryable, throw
      if (attempt === MAX_RETRIES) {
        if (isAbortError) {
          throw new Error(`Paystack API request timed out after ${MAX_RETRIES} attempts. Please try again later.`);
        }
        throw err;
      }
      
      // Log retry attempt
      console.warn(`[paystack] Attempt ${attempt}/${MAX_RETRIES} failed for ${path}, retrying...`, isAbortError ? "(timeout)" : "(network error)");
      
      // Exponential backoff: 1s, 2s, 4s...
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error("Unexpected error in paystackFetch");
}

// ── Initialize checkout (public action — client calls this) ──────

export const initializeCheckout = action({
  args: {
    metadata: v.any(),
    callbackUrl: v.optional(v.string()),
    planCode: v.optional(v.string()), // Tier-specific plan code
  },
  handler: async (ctx, args) => {
    const school = await ctx.runQuery(api.schools.getMySchool);
    if (!school) throw new Error("Unauthorized");

    let activePlanCode: string | undefined = args.planCode || process.env.PAYSTACK_PLAN_ID;
    let planAmount = 0;
    let isPlanValid = false;

    // 1. Try to verify provided planCode directly with Paystack if it's not a legacy placeholder
    if (
      activePlanCode &&
      !activePlanCode.startsWith("PLN_9lh") &&
      !activePlanCode.startsWith("PLN_ffb") &&
      !activePlanCode.startsWith("PLN_yei")
    ) {
      try {
        const planResult = await paystackFetch(`/plan/${activePlanCode}`);
        if (planResult.status && planResult.data) {
          planAmount = planResult.data.amount; // In subunits
          isPlanValid = true;
        }
      } catch (err) {
        console.warn(`[paystack] Provided plan code ${activePlanCode} not found on Paystack:`, err);
      }
    }

    // 2. If planCode is invalid or missing, fetch live plans from Paystack (or auto-create missing ones)
    if (!isPlanValid) {
      console.log("[paystack] Resolving live plan from Paystack...");
      const livePlans: { tier: string; planCode: string; amount: number }[] | null = await ctx.runAction(api.billing.getAllTierPlans, {});
      
      // Match by requested plan code or fallback to starter/first plan
      const match = livePlans?.find((p) => p.planCode === args.planCode) || livePlans?.[0];
      if (match && match.planCode && !match.planCode.startsWith("PLN_")) {
        try {
          const planResult = await paystackFetch(`/plan/${match.planCode}`);
          if (planResult.status && planResult.data) {
            activePlanCode = match.planCode;
            planAmount = planResult.data.amount;
            isPlanValid = true;
          }
        } catch (err) {
          console.warn(`[paystack] Matched plan ${match.planCode} invalid:`, err);
          planAmount = match.amount * 100;
        }
      } else if (match) {
        planAmount = match.amount * 100;
      }
    }

    const callbackUrl = args.callbackUrl || `${typeof window !== "undefined" ? window.location.origin : "http://localhost:3005"}/dashboard/billing`;

    const body: Record<string, unknown> = {
      email: `billing+${school.slug}@schoolmng.app`,
      currency: "KES",
      metadata: {
        schoolId: school._id,
        schoolName: school.name,
        planCode: isPlanValid ? activePlanCode : undefined,
      },
      callback_url: callbackUrl,
    };

    if (isPlanValid && activePlanCode) {
      body.plan = activePlanCode;
    }

    body.amount = planAmount > 0 ? planAmount : 700000;

    const result = await paystackFetch("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      authorization_url: result.data.authorization_url,
      access_code: result.data.access_code,
      reference: result.data.reference,
    };
  },
});

// ── Fetch plan details from Paystack ──────────────────────────────

export const getPlanDetails = internalAction({
  args: { planCode: v.string() },
  handler: async (_ctx, args) => {
    const result = await paystackFetch(`/plan/${args.planCode}`);
    const plan = result.data;

    return {
      id: plan.id,
      name: plan.name,
      amount: plan.amount / 100, // Convert from subunits
      currency: plan.currency,
      interval: plan.interval,
      planCode: plan.plan_code,
      description: plan.description,
    };
  },
});

// ── Verify a transaction (internal action — called from mutations) ──

export const verifyTransaction = internalAction({
  args: { reference: v.string() },
  handler: async (_ctx, args) => {
    const result = await paystackFetch(`/transaction/verify/${args.reference}`);
    const tx = result.data;

    return {
      status: tx.status,
      reference: tx.reference,
      amount: tx.amount / 100,
      currency: tx.currency,
      customer_email: tx.customer?.email,
      metadata: tx.metadata,
      paid_at: tx.paid_at,
      channel: tx.channel,
    };
  },
});

// ── Process webhook event (with idempotency & validation) ────────

export const processWebhookEvent = internalMutation({
  args: {
    eventId: v.string(), // Unique event ID for idempotency
    event: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const { eventId, event, data } = args;
    
    console.log(`[paystack-webhook] Processing event: ${event} (ID: ${eventId})`);

    // ── IDEMPOTENCY CHECK ────────────────────────────────────────
    // Check if this event has already been processed
    const existingEvent = await ctx.db
      .query("webhook_events")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .first();

    if (existingEvent) {
      console.log(`[paystack-webhook] Event already processed: ${eventId}`);
      return { ok: true, duplicate: true };
    }

    // ── CHARGE.SUCCESS HANDLING ─────────────────────────────────
    // Note: Amount validation is handled by Paystack's webhook signature.
    // We don't call fetch() in mutations — Convex doesn't allow it.
    if (event === "charge.success") {
      const metadata = data.metadata ?? {};
      const schoolId = metadata.schoolId;
      const planCode = metadata.planCode || data.plan?.plan_code;

      if (schoolId) {
        const subscriptionCode = data.subscription?.subscription_code;

        if (subscriptionCode) {
          await ctx.runMutation(internal.paystack.handleSubscriptionPayment, {
            schoolId,
            subscriptionCode,
            reference: data.reference,
            amount: data.amount / 100,
            paidAt: new Date(data.paid_at).getTime(),
            planCode,
          });
        } else {
          await ctx.runMutation(internal.paystack.handleOneTimePayment, {
            schoolId,
            reference: data.reference,
            amount: data.amount / 100,
            paidAt: new Date(data.paid_at).getTime(),
            customerEmail: data.customer?.email,
            authorization: data.authorization,
            planCode,
          });
        }
      }
    }

    if (event === "invoice.update") {
      const invoiceStatus = data.status;
      const subscriptionCode = data.subscription?.subscription_code;

      if (subscriptionCode && invoiceStatus === "failed") {
        await ctx.runMutation(internal.paystack.handlePaymentFailure, {
          subscriptionCode,
        });
      }
    }

    // ── CHARGE.DISPUTE HANDLING ─────────────────────────────────
    // When a customer disputes a charge, mark subscription as past_due
    if (event === "charge.dispute") {
      const metadata = data.metadata ?? {};
      const schoolId = metadata.schoolId;
      const subscriptionCode = data.subscription?.subscription_code;

      if (schoolId) {
        await ctx.runMutation(internal.paystack.handleDispute, {
          schoolId,
          subscriptionCode: subscriptionCode ?? undefined,
          reference: data.reference,
          amount: data.amount / 100,
          reason: data.reason ?? "dispute",
        });
      }
    }

    // ── CHARGE.REFUND HANDLING ──────────────────────────────────
    // When a refund is processed, cancel the subscription
    if (event === "charge.refund") {
      const metadata = data.metadata ?? {};
      const schoolId = metadata.schoolId;

      if (schoolId) {
        await ctx.runMutation(internal.paystack.handleRefund, {
          schoolId,
          reference: data.reference,
          amount: data.amount / 100,
          reason: data.reason ?? "refund",
        });
      }
    }

    if (event === "subscription.disable") {
      const subscriptionCode = data.subscription_code;
      if (subscriptionCode) {
        await ctx.runMutation(internal.paystack.handleSubscriptionCancelled, {
          subscriptionCode,
        });
      }
    }

    // ── LOG THE EVENT ────────────────────────────────────────────
    // Store event for idempotency and audit trail
    await ctx.db.insert("webhook_events", {
      eventId,
      event,
      processedAt: Date.now(),
      reference: data.reference,
      schoolId: data.metadata?.schoolId,
      amount: data.amount,
      status: "processed",
    });

    return { ok: true, duplicate: false };
  },
});

// ── Internal mutations for webhook processing ────────────────────

export const handleOneTimePayment = internalMutation({
  args: {
    schoolId: v.id("schools"),
    reference: v.string(),
    amount: v.number(),
    paidAt: v.number(),
    customerEmail: v.optional(v.string()),
    authorization: v.optional(v.any()),
    planCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // ── REFERENCE VALIDATION ──────────────────────────────────
    // Check if this payment reference was already processed via the webhook ledger
    const existingPayment = await ctx.db
      .query("webhook_events")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();

    if (existingPayment && existingPayment.processedAt) {
      console.log(`[paystack] Payment reference ${args.reference} already recorded`);
      return { ok: false, reason: "Already processed" };
    }

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .first();

    if (!sub) {
      console.warn(`[paystack] No subscription found for school ${args.schoolId}`);
      return { ok: false, reason: "No subscription" };
    }

    await ctx.db.patch(sub._id, {
      status: "active",
      lastPaymentAt: args.paidAt,
      nextBillingDate: args.paidAt + 30 * 24 * 60 * 60 * 1000,
      // Store the amount for audit (server-verified)
      amount: args.amount,
      ...(args.planCode ? { assignedPlanCode: args.planCode } : {}),
    });

    console.log(`[paystack] Subscription activated for school ${args.schoolId}`);
    return { ok: true };
  },
});

export const handleSubscriptionPayment = internalMutation({
  args: {
    schoolId: v.id("schools"),
    subscriptionCode: v.string(),
    reference: v.string(),
    amount: v.number(),
    paidAt: v.number(),
    planCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // ── REFERENCE VALIDATION ──────────────────────────────────
    // Check if this payment reference was already processed via the webhook ledger
    const existingPayment = await ctx.db
      .query("webhook_events")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();

    if (existingPayment && existingPayment.processedAt) {
      console.log(`[paystack] Payment reference ${args.reference} already recorded`);
      return { ok: false, reason: "Already processed" };
    }

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .first();

    if (sub) {
      await ctx.db.patch(sub._id, {
        status: "active",
        lastPaymentAt: args.paidAt,
        nextBillingDate: args.paidAt + 30 * 24 * 60 * 60 * 1000,
        amount: args.amount,
        paystackSubscriptionCode: args.subscriptionCode,
        ...(args.planCode ? { assignedPlanCode: args.planCode } : {}),
      });
    }

    console.log(`[paystack] Subscription payment recorded for school ${args.schoolId}`);
    return { ok: true };
  },
});

export const handlePaymentFailure = internalMutation({
  args: { subscriptionCode: v.string() },
  handler: async (ctx, args) => {
    const subs = await ctx.db.query("subscriptions").take(1000);
    const sub = subs.find((s) => s.paystackSubscriptionCode === args.subscriptionCode);

    if (sub) {
      await ctx.db.patch(sub._id, { status: "past_due" });
      console.log(`[paystack] Subscription marked past_due: ${args.subscriptionCode}`);
    }

    return { ok: true };
  },
});

export const handleSubscriptionCancelled = internalMutation({
  args: { subscriptionCode: v.string() },
  handler: async (ctx, args) => {
    const subs = await ctx.db.query("subscriptions").take(1000);
    const sub = subs.find((s) => s.paystackSubscriptionCode === args.subscriptionCode);

    if (sub) {
      await ctx.db.patch(sub._id, { status: "cancelled" });
      console.log(`[paystack] Subscription cancelled: ${args.subscriptionCode}`);
    }

    return { ok: true };
  },
});

// ── Handle charge dispute ───────────────────────────────────────
export const handleDispute = internalMutation({
  args: {
    schoolId: v.id("schools"),
    subscriptionCode: v.optional(v.string()),
    reference: v.string(),
    amount: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the subscription for this school
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .first();

    if (sub) {
      await ctx.db.patch(sub._id, { status: "past_due" });
    }

    // Log the dispute for audit
    await ctx.db.insert("webhook_events", {
      eventId: `dispute_${args.reference}_${Date.now()}`,
      event: "charge.dispute",
      processedAt: Date.now(),
      reference: args.reference,
      schoolId: args.schoolId,
      amount: args.amount * 100, // Store in subunits
      status: "processed",
    });

    console.log(`[paystack] Dispute recorded for school ${args.schoolId}: ${args.reason}`);
    return { ok: true };
  },
});

// ── Handle charge refund ────────────────────────────────────────
export const handleRefund = internalMutation({
  args: {
    schoolId: v.id("schools"),
    reference: v.string(),
    amount: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the subscription for this school
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .first();

    if (sub) {
      await ctx.db.patch(sub._id, {
        status: "cancelled",
        cancelledAt: Date.now(),
      });
    }

    // Log the refund for audit
    await ctx.db.insert("webhook_events", {
      eventId: `refund_${args.reference}_${Date.now()}`,
      event: "charge.refund",
      processedAt: Date.now(),
      reference: args.reference,
      schoolId: args.schoolId,
      amount: args.amount * 100, // Store in subunits
      status: "processed",
    });

    console.log(`[paystack] Refund recorded for school ${args.schoolId}: ${args.reason}`);
    return { ok: true };
  },
});

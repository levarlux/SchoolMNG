import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireSuperadmin, requireSchoolFromJwt, patchDefinedFields, logAuditEntry } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    return await ctx.db.query("subscriptions").take(1000);
  },
});

export const getBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSuperadmin(ctx);
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    planType: v.string(),
    status: v.union(v.literal("trial"), v.literal("active"), v.literal("expired"), v.literal("cancelled"), v.literal("past_due")),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    const subId = await ctx.db.insert("subscriptions", args);
    await logAuditEntry(ctx, args.schoolId, "subscription.create", {
      subscriptionId: subId,
      planType: args.planType,
      status: args.status,
    });
    return subId;
  },
});

export const update = mutation({
  args: {
    id: v.id("subscriptions"),
    planType: v.optional(v.string()),
    status: v.optional(v.union(v.literal("trial"), v.literal("active"), v.literal("expired"), v.literal("cancelled"), v.literal("past_due"))),
  },
  handler: async (ctx, { id, ...updates }) => {
    await requireSuperadmin(ctx);
    const sub = await ctx.db.get(id);
    if (!sub) throw new Error("Subscription not found");
    await patchDefinedFields(ctx, "subscriptions", id, updates);
    await logAuditEntry(ctx, sub.schoolId, "subscription.update", { subscriptionId: id, ...updates });
  },
});

// Get subscription by school (for use by school members)
export const getBySchoolForUser = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    // Use requireSchoolFromJwt to verify authorization
    const school = await requireSchoolFromJwt(ctx);
    if (school._id !== schoolId) {
      throw new Error("Not authorized for this school");
    }
    
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
  },
});

// Cancel subscription (school members can cancel their own)
export const cancelBySchool = mutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    // Use requireSchoolFromJwt to verify authorization
    const school = await requireSchoolFromJwt(ctx);
    if (school._id !== schoolId) {
      throw new Error("Not authorized for this school");
    }
    
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    
    if (!sub) throw new Error("No subscription found");
    
    await ctx.db.patch(sub._id, { status: "cancelled", cancelledAt: Date.now() });
    await logAuditEntry(ctx, schoolId, "subscription.cancelled_by_user", {
      subscriptionId: sub._id,
    });
    
    return { success: true };
  },
});

// ── Cron: expire cancelled subscriptions ─────────────────────────
// Runs periodically to flip cancelled subscriptions to expired once
// their billing period has ended (nextBillingDate has passed).
export const expireCancelledSubscriptions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let expired = 0;

    // Scan all cancelled subscriptions whose nextBillingDate has passed.
    // There is no compound index for (status, nextBillingDate), so we
    // query by status and filter in-code — acceptable volume for a cron
    // that runs every few hours against a bounded set of schools.
    const cancelled = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", "cancelled"))
      .take(1000);

    for (const sub of cancelled) {
      if (!sub.nextBillingDate || sub.nextBillingDate > now) continue;

      await ctx.db.patch(sub._id, { status: "expired" });
      await logAuditEntry(ctx, sub.schoolId, "subscription.expired_after_cancel", {
        subscriptionId: sub._id,
        cancelledAt: sub.cancelledAt,
        nextBillingDate: sub.nextBillingDate,
      });
      expired++;
    }

    return { expired };
  },
});
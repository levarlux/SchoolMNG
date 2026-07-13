import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSuperadmin, patchDefinedFields, logAuditEntry } from "./helpers";

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
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("cancelled"), v.literal("past_due")),
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
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"), v.literal("cancelled"), v.literal("past_due"))),
  },
  handler: async (ctx, { id, ...updates }) => {
    await requireSuperadmin(ctx);
    const sub = await ctx.db.get(id);
    if (!sub) throw new Error("Subscription not found");
    await patchDefinedFields(ctx, "subscriptions", id, updates);
    await logAuditEntry(ctx, sub.schoolId, "subscription.update", { subscriptionId: id, ...updates });
  },
});